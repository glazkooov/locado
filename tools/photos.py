"""tools/photos.py — готовит фото мест для сайта.

Кладёшь в assets/images/places/ фото любого размера (с телефона, с
foto.mos.ru) — скрипт делает из него две версии:

  assets/images/places/<имя>      — для первого экрана: до 2000 px по
                                    ширине, ~300–500 КБ
  assets/images/places/sm/<имя>   — для карточек: 640 px по ширине

Имя файла не меняется, поэтому в places.json ничего править не нужно.
Поворот с телефона учитывается, служебные данные снимка (EXIF: модель
камеры, координаты съёмки) удаляются.

Запуск:
  python3 tools/photos.py                 — все фото, которым это нужно
  python3 tools/photos.py путь/к/фото.jpg — только указанные (и заново)

Нужна библиотека Pillow:  pip install pillow
Автоматически скрипт запускает GitHub Actions при загрузке фото в
репозиторий (.github/workflows/photos.yml).
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps

PLACES = Path('assets/images/places')
SMALL = PLACES / 'sm'
FULL_WIDTH = 2000      # первый экран страницы места
SMALL_WIDTH = 640      # карточки ленты, похожие места, превью
MAX_BYTES = 600_000    # больше — пережимаем, даже если ширина в норме
EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


def save(img, path, width, quality):
    """Уменьшает до width (если шире) и сохраняет в формате по расширению."""
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    ext = path.suffix.lower()
    if ext in ('.jpg', '.jpeg'):
        img.convert('RGB').save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    elif ext == '.webp':
        img.save(path, 'WEBP', quality=quality, method=6)
    else:
        img.save(path, 'PNG', optimize=True)
    return img.size


def process(src, force=False):
    """Возвращает строку отчёта или None, если с фото уже всё в порядке."""
    small = SMALL / src.name
    with Image.open(src) as opened:
        img = ImageOps.exif_transpose(opened)  # фото с телефона — правильной стороной
        img.load()
    too_big = img.width > FULL_WIDTH or src.stat().st_size > MAX_BYTES
    if not (force or too_big or not small.exists()):
        return None

    before = src.stat().st_size
    if force or too_big:
        save(img, src, FULL_WIDTH, 82)
    SMALL.mkdir(exist_ok=True)
    save(img, small, SMALL_WIDTH, 78)
    return (f'{src.name}: {before // 1024} КБ → {src.stat().st_size // 1024} КБ, '
            f'карточка {small.stat().st_size // 1024} КБ')


def main(args):
    if args:
        files = [Path(a) for a in args]
        force = True
    else:
        files = sorted(p for p in PLACES.iterdir() if p.is_file())
        force = False
    files = [f for f in files if f.suffix.lower() in EXTS and f.parent == PLACES and f.exists()]

    done = [line for f in files if (line := process(f, force))]
    print('\n'.join(done) if done else 'Все фото уже готовы.')


if __name__ == '__main__':
    main(sys.argv[1:])
