#!/usr/bin/env python3
"""Generate PWA icons with a paw print design."""

from PIL import Image, ImageDraw
import os

# Colors
PRIMARY_COLOR = (79, 70, 229)  # #4f46e5 - indigo-600
WHITE = (255, 255, 255)

def draw_paw_print(draw, center_x, center_y, scale, color):
    """Draw a paw print at the given center position."""

    # Main pad (large oval)
    pad_width = 36 * scale
    pad_height = 30 * scale
    pad_y_offset = 10 * scale
    draw.ellipse([
        center_x - pad_width/2,
        center_y + pad_y_offset - pad_height/2,
        center_x + pad_width/2,
        center_y + pad_y_offset + pad_height/2
    ], fill=color)

    # Toe pads (4 smaller ovals)
    toes = [
        (-22, -12, 14, 18),  # left outer
        (-8, -22, 12, 16),   # left inner
        (8, -22, 12, 16),    # right inner
        (22, -12, 14, 18),   # right outer
    ]

    for x_off, y_off, width, height in toes:
        toe_x = center_x + x_off * scale
        toe_y = center_y + y_off * scale
        toe_w = width * scale
        toe_h = height * scale
        draw.ellipse([
            toe_x - toe_w/2,
            toe_y - toe_h/2,
            toe_x + toe_w/2,
            toe_y + toe_h/2
        ], fill=color)

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
        # Paw in safe zone (center 80%)
        paw_scale = scale * 0.6  # Smaller paw for maskable safe zone
        draw_paw_print(draw, center, center, paw_scale, WHITE)
    else:
        # Rounded rectangle background
        corner_radius = int(size * 0.2)
        draw.rounded_rectangle(
            [0, 0, size-1, size-1],
            radius=corner_radius,
            fill=PRIMARY_COLOR
        )
        # Paw print
        draw_paw_print(draw, center, center, scale * 0.7, WHITE)

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
