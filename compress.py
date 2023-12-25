import sys
import os
from PIL import Image

filename = sys.argv[1]
filepath = os.path.join(os.getcwd(), filename)
print(sys.argv[1])
image = Image.open(filepath)
if sys.argv[2] == 'png':
    image.save(filename, optimize=True, quality=80)
else:
    rgb_img = image.convert('RGB')
    rgb_img.save(filepath)