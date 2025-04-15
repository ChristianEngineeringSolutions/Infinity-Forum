import sys
import os
from PIL import Image

def compress_jpeg(img, output_filepath, max_size_kb=500, initial_quality=80, quality_step=5, min_quality=10):
    """
    Compresses a PIL Image object to JPEG format in a loop until it's below
    the max_size_kb.

    Args:
        img (PIL.Image.Image): The PIL Image object to compress.
        output_filepath (str): The desired output filepath for the JPEG.
        max_size_kb (int): The target maximum file size in kilobytes.
        initial_quality (int): The initial quality for JPEG compression (0-95).
        quality_step (int): The amount to decrease the JPEG quality in each iteration.
        min_quality (int): The minimum JPEG quality to stop at.

    Returns:
        bool: True if the image was successfully compressed below the target size, False otherwise.
    """
    current_quality = initial_quality
    while current_quality >= min_quality:
        temp_filepath = f"{output_filepath}.temp"
        try:
            img.save(temp_filepath, format="JPEG", quality=current_quality, optimize=True, progressive=True, exif=b'')
            current_size_bytes = os.path.getsize(temp_filepath)
            print(f"JPEG with quality {current_quality}: {current_size_bytes / 1024:.2f} KB")

            if current_size_bytes / 1024 <= max_size_kb:
                os.replace(temp_filepath, output_filepath)
                print(f"Successfully optimized to: {os.path.basename(output_filepath)}")
                return True
            else:
                current_quality -= quality_step
        except Exception as e:
            print(f"Error compressing JPEG: {e}")
            print(f"error {filepath}")
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
            return False
        finally:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)

    print(f"Reached minimum JPEG quality ({min_quality}) but image is still above {max_size_kb} KB.")
    return False

def optimize_image(filepath, max_width=500, max_size_kb=500, initial_jpeg_quality=80, jpeg_quality_step=5, min_jpeg_quality=10):
    """
    Optimizes an image by optionally resizing, converting to JPEG, and compressing.
    Saves two versions if the original width is greater than max_width and deletes the original.

    Args:
        filepath (str): The full path to the image file.
        max_width (int): The maximum width for the reduced-width version.
        max_size_kb (int): The target maximum file size in kilobytes.
        initial_jpeg_quality (int): The initial quality for JPEG compression (0-95).
        jpeg_quality_step (int): The amount to decrease the JPEG quality in each iteration.
        min_jpeg_quality (int): The minimum JPEG quality to stop at.

    Returns:
        bool: True if at least one compressed image was saved and the original was (potentially) deleted, False otherwise.
    """
    try:
        img = Image.open(filepath)
        original_format = img.format.lower()
        filename_without_ext, ext = os.path.splitext(os.path.basename(filepath))
        saved_count = 0
        original_deleted = False
        both_saved = False

        if img.width > max_width:
            # Save original width version
            output_filepath_orig = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig{'.jpg' if original_format == 'png' and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode == 'P') else ext}")
            img_orig = img.copy()
            saved_orig = False
            if original_format == 'png' and not (img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info)):
                img_orig = img_orig.convert('RGB')
                if compress_jpeg(img_orig, output_filepath_orig, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    saved_orig = True
                    print(f"Saved original width version: {output_filepath_orig}")
                    print(f"pngconvert {filepath}")
            elif original_format in ('jpeg', 'jpg'):
                if compress_jpeg(img_orig, output_filepath_orig, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    saved_orig = True
            elif original_format == 'png':
                try:
                    img_orig.save(output_filepath_orig, optimize=True, compress_level=6)
                    final_size_bytes = os.path.getsize(output_filepath_orig)
                    print(f"Optimized PNG (original width) size: {final_size_bytes / 1024:.2f} KB, saved as {output_filepath_orig}")
                    saved_count += 1
                    saved_orig = True
                except Exception as e:
                    print(f"Error optimizing PNG (original width): {e}")
                    print(f"error {filepath}")
            elif original_format == 'gif':
                try:
                    img_orig.save(output_filepath_orig, optimize=True)
                    final_size_bytes = os.path.getsize(output_filepath_orig)
                    print(f"Optimized GIF (original width) size: {final_size_bytes / 1024:.2f} KB, saved as {output_filepath_orig}")
                    saved_count += 1
                    saved_orig = True
                except Exception as e:
                    print(f"Error optimizing GIF (original width): {e}")
                    print(f"error {filepath}")

            # Save reduced width version
            output_filepath_resized = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_medium{'.jpg' if original_format == 'png' and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode == 'P') else ext}")
            height_resized = int(img.height * (max_width / img.width))
            img_resized = img.resize((max_width, height_resized))
            print(f"Resized to width: {max_width}px, height: {height_resized}px")
            saved_resized = False
            if original_format == 'png' and not (img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info)):
                img_resized = img_resized.convert('RGB')
                if compress_jpeg(img_resized, output_filepath_resized, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    saved_resized = True
                    print(f"Saved medium width version: {output_filepath_resized}")
                    print(f"medium {filepath}")
                    print(f"pngconvert {filepath}")
            elif original_format in ('jpeg', 'jpg'):
                if compress_jpeg(img_resized, output_filepath_resized, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    saved_resized = True
                    print(f"medium {filepath}")
            elif original_format == 'png':
                try:
                    img_resized.save(output_filepath_resized, optimize=True, compress_level=6)
                    final_size_bytes = os.path.getsize(output_filepath_resized)
                    print(f"Optimized PNG (medium) size: {final_size_bytes / 1024:.2f} KB, saved as {output_filepath_resized}")
                    saved_count += 1
                    saved_resized = True
                    print(f"medium {filepath}")
            elif original_format == 'gif':
                try:
                    img_resized.save(output_filepath_resized, optimize=True)
                    final_size_bytes = os.path.getsize(output_filepath_resized)
                    print(f"Optimized GIF (medium) size: {final_size_bytes / 1024:.2f} KB, saved as {output_filepath_resized}")
                    saved_count += 1
                    saved_resized = True
                    print(f"medium {filepath}")

            if saved_orig and saved_resized:
                try:
                    os.remove(filepath)
                    print(f"Deleted original file: {filepath}")
                    original_deleted = True
                    both_saved = True
                except Exception as e:
                    print(f"Error deleting original file: {e}")
                    print(f"error {filepath}")

        else:
            # Save only one compressed image with natural width
            output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig{'.jpg' if original_format == 'png' and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode == 'P') else ext}")
            if original_format == 'png' and not (img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info)):
                img = img.convert('RGB')
                if compress_jpeg(img, output_filepath, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    print(f"pngconvert {filepath}")
            elif original_format in ('jpeg', 'jpg'):
                if compress_jpeg(img, output_filepath, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
            elif original_format == 'png':
                try:
                    img.save(output_filepath, optimize=True, compress_level=6)
                    final_size_bytes = os.path.getsize(output_filepath)
                    print(f"Optimized PNG (original width) size: {final_size_bytes / 1024:.2f} KB")
                    saved_count += 1
                except Exception as e:
                    print(f"Error optimizing PNG (original width): {e}")
                    print(f"error {filepath}")
            elif original_format == 'gif':
                try:
                    img.save(output_filepath, optimize=True)
                    final_size_bytes = os.path.getsize(output_filepath)
                    print(f"Optimized GIF (original width) size: {final_size_bytes / 1024:.2f} KB")
                    saved_count += 1
                except Exception as e:
                    print(f"Error optimizing GIF (original width): {e}")
                    print(f"error {filepath}")
            if saved_count > 0:
                try:
                    os.remove(filepath)
                    print(f"Deleted original file: {filepath}")
                    original_deleted = True
                except Exception as e:
                    print(f"Error deleting original file: {e}")
                    print(f"error {filepath}")

        if img.width > max_width and saved_orig and saved_resized and original_deleted:
            print("Image optimization (both original and medium) and original file deletion completed.")
            return True
        elif img.width <= max_width and saved_count > 0 and original_deleted:
            print("Image optimization and original file deletion completed.")
            return True
        elif saved_count > 0:
            print("Image optimization completed.")
            return True
        else:
            print("Image optimization process finished, but no image was saved.")
            return False

    except FileNotFoundError:
        print(f"Error: File not found at {filepath}")
        print(f"error {filepath}")
        return False
    except Exception as e:
        print(f"An error occurred: {e}")
        print(f"error {filepath}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python optimize_image.py <filename>")
        sys.exit(1)

    filename = sys.argv[1]
    filepath = os.path.join(os.getcwd(), filename)

    print(f"Processing image: {filename}")
    optimized = optimize_image(filepath)