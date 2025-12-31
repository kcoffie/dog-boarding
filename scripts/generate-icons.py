#!/usr/bin/env python3
"""Generate PWA icons with a house design."""

from PIL import Image, ImageDraw
import os

# Colors
PRIMARY_COLOR = (79, 70, 229)  # #4f46e5 - indigo-600
WHITE = (255, 255, 255)

def draw_house(draw, center_x, center_y, scale, color):
    """Draw a house icon at the given center position."""

    # House dimensions relative to scale
    house_width = 50 * scale
    house_height = 35 * scale
    roof_height = 25 * scale

    # Calculate positions
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
        (center_x, roof_peak),      # Peak
        (roof_left, roof_bottom),   # Left corner
        (roof_right, roof_bottom),  # Right corner
    ], fill=color)

    # House body (rectangle)
    body_top = roof_bottom - 2 * scale
    draw.rectangle([
        left, body_top,
        right, bottom
    ], fill=color)

    # Door (rectangle in center-bottom)
    door_width = 12 * scale
    door_height = 18 * scale
    door_left = center_x - door_width / 2
    door_right = center_x + door_width / 2
    door_top = bottom - door_height
    door_bottom = bottom

    draw.rectangle([
        door_left, door_top,
        door_right, door_bottom
    ], fill=PRIMARY_COLOR if color == WHITE else WHITE)

    # Window (small square on left side)
    window_size = 10 * scale
    window_left = left + 8 * scale
    window_top = body_top + 10 * scale

    draw.rectangle([
        window_left, window_top,
        window_left + window_size, window_top + window_size
    ], fill=PRIMARY_COLOR if color == WHITE else WHITE)

def generate_icon(size, maskable=False):
    """Generate a single icon at the given size."""

    # Create image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = size / 2
    scale = size / 100

    if maskable:
        # Full bleed background for maskable icons
        draw.rectangle([0, 0, size, size], fill=PRIMARY_COLOR)
        # House in safe zone (center 80%)
        house_scale = scale * 0.55
        draw_house(draw, center, center, house_scale, WHITE)
    else:
        # Rounded rectangle background
        corner_radius = int(size * 0.2)
        draw.rounded_rectangle(
            [0, 0, size-1, size-1],
            radius=corner_radius,
            fill=PRIMARY_COLOR
        )
        # House icon
        draw_house(draw, center, center, scale * 0.65, WHITE)

    return img

def main():
    # Output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(script_dir, '..', 'public', 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    # Standard icon sizes
    standard_sizes = [16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512]

    # Generate standard icons
    for size in standard_sizes:
        icon = generate_icon(size, maskable=False)

        # Save with appropriate name
        if size in [16, 32]:
            filename = f'favicon-{size}x{size}.png'
        elif size == 180:
            # Also save as apple-touch-icon
            icon.save(os.path.join(icons_dir, 'apple-touch-icon.png'))
            filename = f'icon-{size}x{size}.png'
        else:
            filename = f'icon-{size}x{size}.png'

        icon.save(os.path.join(icons_dir, filename))
        print(f'Generated {filename}')

    # Generate maskable icons (192 and 512)
    for size in [192, 512]:
        icon = generate_icon(size, maskable=True)
        filename = f'icon-maskable-{size}x{size}.png'
        icon.save(os.path.join(icons_dir, filename))
        print(f'Generated {filename}')

    print(f'\nAll icons saved to {icons_dir}')

if __name__ == '__main__':
    main()
