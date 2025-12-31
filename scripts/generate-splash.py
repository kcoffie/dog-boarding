#!/usr/bin/env python3
"""Generate iOS splash screens with house icon."""

from PIL import Image, ImageDraw
import os

# Colors
PRIMARY_COLOR = (79, 70, 229)  # #4f46e5 - indigo-600
WHITE = (255, 255, 255)
BACKGROUND = (248, 250, 252)  # #f8fafc - slate-50

# iOS splash screen sizes (width x height)
SPLASH_SIZES = [
    (750, 1334),    # iPhone SE, 8, 7, 6s, 6
    (1242, 2208),   # iPhone 8 Plus, 7 Plus, 6s Plus, 6 Plus
    (1125, 2436),   # iPhone X, Xs, 11 Pro, 12 Mini, 13 Mini
    (828, 1792),    # iPhone Xr, 11, 12, 12 Pro, 13, 13 Pro, 14
    (1242, 2688),   # iPhone Xs Max, 11 Pro Max
    (1284, 2778),   # iPhone 12 Pro Max, 13 Pro Max, 14 Plus
    (1179, 2556),   # iPhone 14 Pro, 15, 15 Pro
    (1290, 2796),   # iPhone 14 Pro Max, 15 Plus, 15 Pro Max
]

def draw_house(draw, center_x, center_y, scale, color):
    """Draw a house icon at the given center position."""

    house_width = 50 * scale
    house_height = 35 * scale
    roof_height = 25 * scale

    left = center_x - house_width / 2
    right = center_x + house_width / 2
    top = center_y - roof_height / 2
    bottom = center_y + house_height / 2 + 5 * scale

    # Roof (triangle)
    roof_peak = top - 5 * scale
    roof_left = left - 5 * scale
    roof_right = right + 5 * scale
    roof_bottom = top + roof_height / 2

    draw.polygon([
        (center_x, roof_peak),
        (roof_left, roof_bottom),
        (roof_right, roof_bottom),
    ], fill=color)

    # House body
    body_top = roof_bottom - 2 * scale
    draw.rectangle([left, body_top, right, bottom], fill=color)

    # Door
    door_width = 12 * scale
    door_height = 18 * scale
    door_left = center_x - door_width / 2
    door_right = center_x + door_width / 2
    door_top = bottom - door_height

    draw.rectangle([door_left, door_top, door_right, bottom], fill=BACKGROUND)

    # Window
    window_size = 10 * scale
    window_left = left + 8 * scale
    window_top = body_top + 10 * scale

    draw.rectangle([
        window_left, window_top,
        window_left + window_size, window_top + window_size
    ], fill=BACKGROUND)

def generate_splash(width, height):
    """Generate a splash screen at the given size."""

    img = Image.new('RGB', (width, height), BACKGROUND)
    draw = ImageDraw.Draw(img)

    center_x = width / 2
    center_y = height / 2 - height * 0.05  # Slightly above center

    # Icon container (rounded rectangle)
    icon_size = min(width, height) * 0.25
    corner_radius = int(icon_size * 0.2)

    icon_left = center_x - icon_size / 2
    icon_top = center_y - icon_size / 2
    icon_right = center_x + icon_size / 2
    icon_bottom = center_y + icon_size / 2

    draw.rounded_rectangle(
        [icon_left, icon_top, icon_right, icon_bottom],
        radius=corner_radius,
        fill=PRIMARY_COLOR
    )

    # House icon inside
    scale = icon_size / 100 * 0.65
    draw_house(draw, center_x, center_y, scale, WHITE)

    return img

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    splash_dir = os.path.join(script_dir, '..', 'public', 'splash')
    os.makedirs(splash_dir, exist_ok=True)

    for width, height in SPLASH_SIZES:
        img = generate_splash(width, height)
        filename = f'apple-splash-{width}-{height}.png'
        img.save(os.path.join(splash_dir, filename))
        print(f'Generated {filename}')

    print(f'\nAll splash screens saved to {splash_dir}')

if __name__ == '__main__':
    main()
