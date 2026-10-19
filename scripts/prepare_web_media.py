"""Create verified, same-origin playback copies without putting videos in Git."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from fractions import Fraction
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TRANSFORM = 'web-media-v1-640px-h264-crf24-faststart'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def inspect(path, ffprobe):
    result = subprocess.run([
        ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=codec_name,pix_fmt,width,height,avg_frame_rate,nb_frames,duration',
        '-of', 'json', str(path),
    ], check=True, capture_output=True, text=True)
    streams = json.loads(result.stdout)['streams']
    if not streams:
        raise ValueError('No video stream')
    stream = streams[0]
    if not str(stream.get('nb_frames', '')).isdigit():
        result = subprocess.run([
            ffprobe, '-v', 'error', '-count_frames', '-select_streams', 'v:0',
            '-show_entries', 'stream=nb_read_frames', '-of', 'json', str(path),
        ], check=True, capture_output=True, text=True)
        stream['nb_frames'] = json.loads(result.stdout)['streams'][0]['nb_read_frames']
    stream['frames'] = int(stream.pop('nb_frames'))
    stream['fps'] = float(Fraction(stream.pop('avg_frame_rate')))
    stream['duration'] = float(stream.get('duration', stream['frames'] / stream['fps']))
    return stream


def download(url, target, expected_hash):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'PhysCodeGym-Homepage/1.0'})
            with urllib.request.urlopen(request, timeout=35) as response, target.open('wb') as output:
                shutil.copyfileobj(response, output, 1024 * 1024)
            if digest(target) != expected_hash:
                raise ValueError('Source video hash does not match the pinned release')
            return
        except Exception:
            target.unlink(missing_ok=True)
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def prepare(item, cache, ffmpeg, ffprobe):
    source_hash = item['source_sha256']
    reference = item['kind'] == 'reference'
    key = ('reference-' if reference else 'model-') + source_hash
    video = cache / (key + '.mp4')
    metadata = cache / (key + '.json')
    if video.is_file() and metadata.is_file():
        saved = json.loads(metadata.read_text())
        if (saved.get('transform') == TRANSFORM and saved.get('source_sha256') == source_hash
                and saved.get('full_decode') == 'passed' and digest(video) == saved.get('sha256')):
            return video, saved

    with tempfile.TemporaryDirectory(dir=cache) as temporary:
        folder = Path(temporary)
        original, output = folder / 'source.mp4', folder / 'playback.mp4'
        download(item['video'], original, source_hash)
        before = inspect(original, ffprobe)
        compatible = before['codec_name'] == 'h264' and before['pix_fmt'] == 'yuv420p'
        command = [ffmpeg, '-v', 'error', '-xerror', '-y', '-threads', '1', '-i', str(original), '-map', '0:v:0', '-an']
        if reference or not compatible:
            command += [
                '-vf', 'scale=trunc(min(640\,iw)/2)*2:-2', '-c:v', 'libx264',
                '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-threads', '1',
                '-fps_mode', 'passthrough',
            ]
        else:
            command += ['-c:v', 'copy']
        command += ['-movflags', '+faststart', str(output)]
        subprocess.run(command, check=True, capture_output=True)
        after = inspect(output, ffprobe)
        if (after['frames'] != before['frames'] or abs(after['fps'] - before['fps']) > 0.001
                or abs(after['duration'] - before['duration']) > 0.04):
            raise ValueError('Playback conversion changed video timing')
        if after['codec_name'] != 'h264' or after['pix_fmt'] != 'yuv420p':
            raise ValueError('Playback copy is not browser-compatible H.264')
        subprocess.run([
            ffmpeg, '-v', 'error', '-xerror', '-threads', '1', '-i', str(output),
            '-map', '0:v:0', '-f', 'null', '-',
        ], check=True, capture_output=True)
        saved = {
            'source': item['video'], 'source_sha256': source_hash,
            'path': 'media/playback/' + key + '.mp4', 'sha256': digest(output),
            'bytes': output.stat().st_size, 'transform': TRANSFORM,
            'full_decode': 'passed', **after,
        }
        os.replace(output, video)
        pending = folder / 'metadata.json'
        pending.write_text(json.dumps(saved, indent=2) + '\n')
        os.replace(pending, metadata)
    return video, saved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/site-media')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise SystemExit('FFmpeg and FFprobe are required to prepare website videos.')
    catalog = json.loads((ROOT / 'qa/video-catalog-manifest.json').read_text())
    data_path = args.output / 'data/cases.json'
    cases = json.loads(data_path.read_text())
    prefix = f"https://huggingface.co/datasets/{catalog['repository']}/resolve/{catalog['commit']}/"
    assets = {a['video']: a for a in catalog['assets']}
    requested = {c['reference'] for c in cases}
    requested.update(m['video'] for c in cases for m in c['models'])
    remote = sorted(url for url in requested if url.startswith('https://'))
    local_paths = sorted(path for path in requested if not path.startswith('https://'))
    if (args.output / 'media/overview.mp4').is_file():
        local_paths.append('media/overview.mp4')
    if any(not url.startswith(prefix) or url not in assets for url in remote):
        raise ValueError('An unverified remote video was found in the task catalog')
    args.cache.mkdir(parents=True, exist_ok=True)
    destination = args.output / 'media/playback'
    destination.mkdir(parents=True, exist_ok=True)
    prepared = {}
    unique = {(assets[url]['kind'] == 'reference', assets[url]['source_sha256']): assets[url] for url in remote}
    print(f'Preparing {len(remote)} video URLs ({len(unique)} unique playback copies).', flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs = [pool.submit(prepare, item, args.cache, ffmpeg, ffprobe) for item in unique.values()]
        for index, job in enumerate(as_completed(jobs), 1):
            video, metadata = job.result()
            shutil.copy2(video, args.output / metadata['path'])
            prepared[(metadata['path'].split('/')[-1].startswith('reference-'), metadata['source_sha256'])] = metadata
            if index % 100 == 0 or index == len(jobs):
                print(f'Verified {index}/{len(jobs)} playback copies.', flush=True)
    for case in cases:
        if case['reference'] in remote:
            source = case['reference']; item = assets[source]
            media = prepared[(True, item['source_sha256'])]
            case.update(reference=media['path'], referenceSource=source, referencePreviewSha256=media['sha256'])
        for model in case['models']:
            if model['video'] in remote:
                source = model['video']; item = assets[source]
                media = prepared[(False, item['source_sha256'])]
                model.update(video=media['path'], videoSource=source, videoPreviewSha256=media['sha256'])
    playback = [c['reference'] for c in cases] + [m['video'] for c in cases for m in c['models']]
    if any(path.startswith(('http:', 'https:', '//')) or not (args.output / path).is_file() for path in playback):
        raise ValueError('A playback URL was not prepared as a local file')
    data_path.write_text(json.dumps(cases, ensure_ascii=False, separators=(',', ':')) + '\n')
    size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
    if size > 850 * 1024 * 1024:
        raise ValueError('Website exceeds the 850 MiB publication budget')
    def verify_local(path):
        video = args.output / path
        info = inspect(video, ffprobe)
        if info['codec_name'] != 'h264' or info['pix_fmt'] != 'yuv420p':
            raise ValueError(f'Unsupported local video: {path}')
        subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-threads', '1', '-i', str(video),
                        '-map', '0:v:0', '-f', 'null', '-'], check=True, capture_output=True)
        return {'path': path, 'sha256': digest(video), 'full_decode': 'passed', **info}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        local_checks = list(pool.map(verify_local, local_paths))
    report = {'repository': catalog['repository'], 'commit': catalog['commit'],
              'video_count': len(prepared), 'local_video_count': len(local_checks),
              'site_bytes': size, 'videos': sorted(prepared.values(), key=lambda m: m['path']),
              'existing_videos': local_checks}
    (args.output / 'data/media-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'All playback URLs are local. Site size: {size / 1024 / 1024:.1f} MiB.', flush=True)


if __name__ == '__main__':
    main()
