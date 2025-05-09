import os
import subprocess
import time
import sys
from PIL import Image
import cv2  # Import OpenCV
import numpy as np

def optimize_png_with_pngquant(image, output_filepath, dither=True, posterize_bits=None):
    """
    Optimizes a PNG image using pngquant from a PIL Image object.  Uses OpenCV for initial PNG encoding.

    Args:
        image (PIL.Image.Image): The input PIL Image object.
        output_filepath (str): Path to save the optimized PNG file.
        dither (bool, optional): Enable or disable dithering. Defaults to True.
        posterize_bits (int, optional): Reduce color depth by posterizing. Defaults to None.

    Returns:
        bool: True if optimization was successful, False otherwise.
    """
    try:
        if posterize_bits:
            image = image.quantize(colors=2**posterize_bits)

        # 1. Convert PIL Image to OpenCV format
        if image.mode == "L":  # Handle grayscale images
            image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_GRAY2BGR)
        elif image.mode == "RGB":
            image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        elif image.mode == "RGBA":
            image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGBA2BGRA)
        else:
            image_cv = np.array(image) #leave as is

        # 2. Encode to PNG using OpenCV (faster than Pillow for raw encoding)
        encode_param = [int(cv2.IMWRITE_PNG_COMPRESSION), 0]  # 0 for no compression
        _, png_data_encoded = cv2.imencode('.png', image_cv, encode_param)
        png_data = png_data_encoded.tobytes()



        command = ['pngquant', '--force', '--output', output_filepath, '-']  # '-' for stdin
        if not dither:
            command.append('--nofs')

        # 3. Use subprocess.run with input from OpenCV's encoded PNG data
        result = subprocess.run(
            command,
            input=png_data,
            check=True,
            capture_output=True,
        )
        if result.returncode != 0:
            print(f"pngquant failed with error code {result.returncode}: {result.stderr.decode()}")
            return False
        return True
    except subprocess.CalledProcessError as e:
        print(f"pngquant failed with error code {e.returncode}: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print("Error: pngquant command not found. Please ensure it is installed and in your system's PATH.")
        return False
    except Exception as e:
        print(f"An unexpected error occurred during pngquant optimization: {e}")
        return False



def compress_jpeg(image, output_filepath, max_size_kb=500, initial_quality=80, quality_step=5, min_quality=10):
    """Compresses a JPEG image to be within a maximum size limit.

    Args:
        image (PIL.Image.Image): The input image.
        output_filepath (str): The path to save the compressed JPEG.
        max_size_kb (int): The maximum allowed size of the compressed image in KB.
        initial_quality (int): The starting JPEG quality (0-100).
        quality_step (int): The amount to reduce quality by in each iteration.
        min_quality (int): The minimum allowed JPEG quality.

    Returns:
        bool: True if compression was successful, False otherwise.
    """
    max_size_bytes = max_size_kb * 1024
    quality = initial_quality
    try:
        while quality >= min_quality:
            image.save(output_filepath, 'JPEG', quality=quality, optimize=True)
            file_size = os.path.getsize(output_filepath)
            if file_size <= max_size_bytes:
                print(f"Compressed to {file_size / 1024:.2f} KB with quality {quality}")
                return True
            quality -= quality_step
        else:
            print(f"Failed to compress image within {max_size_kb}KB.  Final quality was {quality}")
            return False
    except Exception as e:
        print(f"Error during JPEG compression: {e}")
        return False



def optimize_image(filepath, max_width=500, max_size_kb=500, initial_jpeg_quality=80, jpeg_quality_step=5, min_jpeg_quality=10, dither=True, posterize_bits=None, profile_photo=False):
    """
    Optimizes an image by optionally resizing, converting to JPEG, and compressing.
    Saves two versions if the original width is greater than max_width and deletes the original.
    Uses pngquant for PNG optimization, and OpenCV for initial PNG encoding.  Handles WebP, TIFF, SVG, BMP, AVIF, APNG, and ICO.

    Args:
        filepath (str): Path to the input image file.
        max_width (int, optional): Maximum width for the resized image. Defaults to 500.
        max_size_kb (int, optional): Maximum file size in KB. Defaults to 500.
        initial_jpeg_quality (int, optional): Initial JPEG quality. Defaults to 80.
        jpeg_quality_step (int, optional): JPEG quality reduction step. Defaults to 5.
        min_jpeg_quality (int, optional): Minimum JPEG quality. Defaults to 10.
        dither (bool, optional): Enable or disable dithering. Defaults to True.
        posterize_bits (int, optional): Reduce color depth by posterizing. Defaults to None.
    """
    try:
        is_profile_photo = sys.argv[2]
        if is_profile_photo == 'true':
            is_profile_photo = True
        else:
            is_profile_photo = False 
        img = Image.open(filepath)
        original_format = img.format.lower()
        filename_without_ext, ext = os.path.splitext(os.path.basename(filepath))
        saved_count = 0
        original_deleted = False
        both_saved = False

        if original_format not in ('png', 'jpeg', 'jpg', 'gif', 'webp', 'tiff', 'tif', 'svg', 'bmp', 'avif', 'apng', 'ico'):
            print(f"Unsupported image format: {original_format}")
            return False

        # Initialize img_resized here to avoid "referenced before assignment" error
        img_resized = img.copy()  # Initialize with a copy of the original image

        if img.width > max_width:
            saved_orig = False
            # Save original width version
            if not is_profile_photo:
                if is_profile_photo:
                    output_filepath_orig_base = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}")
                else:
                    output_filepath_orig_base = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig")
                output_filepath_orig_ext = '.jpg' if  (original_format == 'tiff' or original_format == 'tif' or original_format == 'avif' or original_format == 'apng' ) and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else  '.jpg' if (original_format == 'webp' or original_format == 'png') and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else ext
                output_filepath_orig = output_filepath_orig_base + output_filepath_orig_ext
                img_orig = img.copy()
                saved_orig = False

                if original_format == 'png':
                    if not (img_orig.mode == 'RGBA' or (img_orig.mode == 'P' and 'transparency' in img_orig.info)):
                        img_orig = img_orig.convert('RGB')
                        if compress_jpeg(img_orig, output_filepath_orig, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                            saved_orig = True
                            saved_count += 1
                            print(f"pngconvert {filepath}")
                            print(f"Saved original width version (JPEG): {output_filepath_orig}")
                    else:
                        if optimize_png_with_pngquant(img_orig, output_filepath_orig, dither, posterize_bits):
                            saved_orig = True
                            saved_count += 1
                            print(f"Saved original width version (pngquant): {output_filepath_orig}")
                        else:
                            print(f"Error optimizing original PNG with Pillow's save.")
                            try:
                                img_orig.save(output_filepath_orig, optimize=False, compress_level=6)
                                saved_orig = True
                                saved_count += 1
                                print(f"Saved original width version (Pillow): {output_filepath_orig}")
                            except Exception as e:
                                print(f"Error saving original PNG with Pillow: {e}")
                                print(f"error {filepath}")

                elif original_format in ('jpeg', 'jpg'):
                    start_time = time.time()
                    if compress_jpeg(img_orig, output_filepath_orig, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                        end_time = time.time()
                        print(f"JPEG compression time (original): {end_time - start_time:.2f} seconds")
                        saved_count += 1
                        saved_orig = True
                        print(f"Saved original width version: {output_filepath_orig}")
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
                elif original_format == 'webp':  # Handle WebP
                    output_filepath_orig_ext = '.jpg' if img_orig.mode != 'RGBA' and not ('transparency' in img_orig.info and img.mode != 'P') else '.webp'
                    output_filepath_orig = output_filepath_orig_base + output_filepath_orig_ext
                    if  img_orig.mode != 'RGBA' and not ('transparency' in img_orig.info and img.mode != 'P'):
                        img_orig.save(output_filepath_orig, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                        print(f"Saved original width version (JPEG): {output_filepath_orig}")
                    else:
                        img_orig.save(output_filepath_orig, 'WEBP', quality=initial_jpeg_quality, optimize=True)
                        print(f"Saved original width version (WebP): {output_filepath_orig}")
                    saved_orig = True
                    saved_count += 1

                elif original_format in ('tiff', 'tif', 'avif', 'apng'):  #  TIFF, AVIF, APNG
                    output_filepath_orig_ext = '.jpg' if img_orig.mode != 'RGBA' and not ('transparency' in img_orig.info and img.mode != 'P') else ext
                    output_filepath_orig = output_filepath_orig_base + output_filepath_orig_ext
                    img_orig.save(output_filepath_orig, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                    saved_orig = True
                    saved_count += 1
                    print(f"Saved original width version (JPEG conversion): {output_filepath_orig}")
                elif original_format in ('svg', 'bmp', 'ico'):
                    output_filepath_orig_ext = '.png'
                    output_filepath_orig = output_filepath_orig_base + output_filepath_orig_ext
                    img_orig.save(output_filepath_orig, 'PNG', optimize=True)
                    saved_orig = True
                    saved_count += 1
                    print(f"Saved original width version (PNG conversion): {output_filepath_orig}")

            # Save reduced width version
            if is_profile_photo:
                output_filepath_resized_base = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}")
            else:
                output_filepath_resized_base = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_medium")
            output_filepath_resized_ext = '.jpg' if  (original_format == 'tiff' or original_format == 'tif' or original_format == 'avif' or original_format == 'apng')  and img_resized.mode != 'RGBA' and not ('transparency' in img_resized.info and img_resized.mode != 'P') else  '.jpg' if (original_format == 'webp' or original_format == 'png') and img_resized.mode != 'RGBA' and not ('transparency' in img_resized.info and img_resized.mode != 'P') else ext
            output_filepath_resized = output_filepath_resized_base + output_filepath_resized_ext
            height_resized = int(img.height * (max_width / img.width))
            img_resized = img.resize((max_width, height_resized))
            print(f"Resized to width: {max_width}px, height: {height_resized}px")
            saved_resized = False

            if original_format == 'png':
                if not (img_resized.mode == 'RGBA' or (img_resized.mode == 'P' and 'transparency' in img_resized.info)):
                    img_resized = img_resized.convert('RGB')
                    if compress_jpeg(img_resized, output_filepath_resized, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                        saved_count += 1
                        saved_resized = True
                        print(f"pngconvert {filepath}")
                        print(f"Saved medium width version: {output_filepath_resized}")
                        print(f"medium {filepath}")
                else:
                    if optimize_png_with_pngquant(img_resized, output_filepath_resized, dither, posterize_bits):
                        saved_resized = True
                        saved_count += 1
                        print(f"Saved medium width version (pngquant): {output_filepath_resized}")
                        print(f"medium {filepath}")
                    else:
                        print(f"Error optimizing medium PNG with Pillow's save.")
                        try:
                            img_resized.save(output_filepath_resized, optimize=False, compress_level=6)
                            saved_resized = True
                            saved_count += 1
                            print(f"Saved medium width version (Pillow): {output_filepath_resized}")
                            print(f"medium {filepath}")
                        except Exception as e:
                            print(f"Error saving medium PNG with Pillow: {e}")
                            print(f"error {filepath}")

            elif original_format in ('jpeg', 'jpg'):
                if compress_jpeg(img_resized, output_filepath_resized, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
                    saved_resized = True
                    print(f"Saved medium width version: {output_filepath_resized}")
                    print(f"medium {filepath}")
            elif original_format == 'gif':
                try:
                    img_resized.save(output_filepath_resized, optimize=True)
                    final_size_bytes = os.path.getsize(output_filepath_resized)
                    print(f"Optimized GIF (medium) size: {final_size_bytes / 1024:.2f} KB, saved as {output_filepath_resized}")
                    saved_count += 1
                    saved_resized = True
                    print(f"medium {filepath}")
                except Exception as e:
                    print(f"Error optimizing GIF (medium): {e}")
                    print(f"error {filepath}")
            elif original_format == 'webp':
                output_filepath_resized_ext = '.jpg' if img_resized.mode != 'RGBA' and not ('transparency' in img_resized.info and img_resized.mode != 'P') else '.webp'
                output_filepath_resized = output_filepath_resized_base + output_filepath_resized_ext
                if  img_resized.mode != 'RGBA' and not ('transparency' in img_resized.info and img_resized.mode != 'P'):
                    img_resized.save(output_filepath_resized, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                    saved_resized = True
                    saved_count += 1
                    print(f"Saved medium width version (JPEG): {output_filepath_resized}")
                else:
                    img_resized.save(output_filepath_resized, 'WEBP', quality=initial_jpeg_quality, optimize=True)
                    saved_resized = True
                    saved_count += 1
                    print(f"Saved medium width version (WebP): {output_filepath_resized}")
            elif original_format in ('tiff', 'tif', 'avif', 'apng'):  #  TIFF, AVIF, APNG
                output_filepath_resized_ext = '.jpg' if img_resized.mode != 'RGBA' and not ('transparency' in img_resized.info and img_resized.mode != 'P') else ext
                output_filepath_resized = output_filepath_resized_base + output_filepath_resized_ext
                img_resized.save(output_filepath_resized, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                saved_resized = True
                saved_count += 1
                print(f"Saved medium width version (JPEG conversion): {output_filepath_resized}")
            elif original_format in ('svg', 'bmp', 'ico'):
                output_filepath_resized_ext = '.png'
                output_filepath_resized = output_filepath_resized_base + output_filepath_resized_ext
                img_resized.save(output_filepath_resized, 'PNG', optimize=True)
                saved_resized = True
                saved_count += 1
                print(f"Saved medium width version (PNG conversion): {output_filepath_resized}")

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
            if is_profile_photo:
                output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}{'.jpg' if original_format == 'png' and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else ext}")
            else:
                output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig{'.jpg' if original_format == 'png' and img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else ext}")
            if original_format == 'png':
                if not (img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info)):
                    img = img.convert('RGB')
                    if compress_jpeg(img, output_filepath, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                        saved_count += 1
                        print(f"pngconvert {filepath}")
                        print(f"Saved optimized version (JPEG): {output_filepath}")
                else:

                    if optimize_png_with_pngquant(img, output_filepath, dither, posterize_bits):
                        saved_count += 1
                        print(f"Saved optimized (pngquant) version: {output_filepath}")
                    else:
                        print(f"Error optimizing PNG with Pillow's save.")
                        try:
                            img.save(output_filepath, optimize=False, compress_level=6)
                            saved_count += 1
                            print(f"Saved optimized (Pillow) version: {output_filepath}")
                        except Exception as e:
                            print(f"Error saving PNG with Pillow: {e}")
                            print(f"error {filepath}")
            elif original_format in ('jpeg', 'jpg'):
                if compress_jpeg(img, output_filepath, max_size_kb, initial_jpeg_quality, jpeg_quality_step, min_jpeg_quality):
                    saved_count += 1
            elif original_format == 'gif':
                try:
                    img.save(output_filepath, optimize=True)
                    final_size_bytes = os.path.getsize(output_filepath)
                    print(f"Optimized GIF size: {final_size_bytes / 1024:.2f} KB")
                    saved_count += 1
                except Exception as e:
                    print(f"Error optimizing GIF: {e}")
                    print(f"error {filepath}")
            elif original_format == 'webp':  # Handle WebP
                output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig{'.jpg' if img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else '.webp'}")
                if  img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P'):
                    img.save(output_filepath, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                    print(f"Saved optimized version (JPEG): {output_filepath}")
                else:
                    img.save(output_filepath, 'WEBP', quality=initial_jpeg_quality, optimize=True)
                    print(f"Saved optimized version (WebP): {output_filepath}")
                saved_count += 1

            elif original_format in ('tiff', 'tif', 'avif', 'apng'):  #  TIFF, AVIF, APNG
                output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig.jpg") if img.mode != 'RGBA' and not ('transparency' in img.info and img.mode != 'P') else os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig{ext}")
                img.save(output_filepath, 'JPEG', quality=initial_jpeg_quality, optimize=True)
                saved_count +=1
                print(f"Saved optimized version (JPEG conversion): {output_filepath}")
            elif original_format in ('svg', 'bmp', 'ico'): #handle svg, bmp, ico
                output_filepath = os.path.join(os.path.dirname(filepath), f"{filename_without_ext}_orig.png")
                img.save(output_filepath, 'PNG', optimize=True)
                saved_count += 1
                print(f"Saved optimized version (PNG conversion): {output_filepath}")

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
        print("Usage: python optimize_image.py <filename> <profilephoto>")
        sys.exit(1)

    filename = sys.argv[1]
    filepath = os.path.join(os.getcwd(), filename)

    print(f"Processing image: {filename}")
    optimized = optimize_image(filepath)
