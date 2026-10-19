from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from unittest.mock import patch
import hashlib
import shutil
import subprocess
import tempfile
import unittest

import prepare_web_media as media


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg is required')
class MediaPreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory()
        cls.root = Path(cls.workspace.name)
        cls.source = cls.root / 'source.mp4'
        cls.ffmpeg, cls.ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
        subprocess.run([
            cls.ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=30',
            '-t', '1', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', str(cls.source),
        ], check=True, capture_output=True)
        cls.hash = media.digest(cls.source)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(cls.root)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/source.mp4'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
        cls.workspace.cleanup()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.cache = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def prepare(self, kind):
        return media.prepare({'kind': kind, 'source_sha256': self.hash, 'video': self.url},
                             self.cache, self.ffmpeg, self.ffprobe)

    def test_reference_resize_preserves_frames_and_timing(self):
        output, info = self.prepare('reference')
        self.assertEqual((info['width'], info['height'], info['frames']), (640, 360, 30))
        self.assertEqual(info['fps'], 30)
        self.assertAlmostEqual(info['duration'], 1)
        self.assertEqual(info['source_sha256'], self.hash)
        self.assertEqual(info['sha256'], media.digest(output))
        modified = output.stat().st_mtime_ns
        self.prepare('reference')
        self.assertEqual(output.stat().st_mtime_ns, modified)
        output.write_bytes(b'corrupted cached preview')
        self.prepare('reference')
        self.assertEqual(media.digest(output), info['sha256'])

    def test_model_remux_preserves_decoded_pixels(self):
        output, info = self.prepare('reconstruction')
        def frames(path):
            result = subprocess.run([self.ffmpeg, '-v', 'error', '-i', str(path), '-map', '0:v:0',
                                     '-f', 'framemd5', '-'], check=True, capture_output=True, text=True)
            return [row.split(',')[-1].strip() for row in result.stdout.splitlines() if row and not row.startswith('#')]
        self.assertEqual(frames(self.source), frames(output))
        self.assertEqual((info['width'], info['height']), (960, 540))

    def test_source_hash_mismatch_cannot_be_published(self):
        target = self.cache / 'invalid.mp4'
        with patch.object(media.time, 'sleep'), self.assertRaises(ValueError):
            media.download(self.url, target, '0' * 64)
        self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
