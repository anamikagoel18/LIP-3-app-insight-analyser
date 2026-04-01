import shutil
import os

folders = ['node_modules', 'phase5_frontend', 'phase5_nextjs', 'phase6_utils']
files = ['package.json', 'package-lock.json', 'packages.txt', 'adaptive_pipeline.js']

for folder in folders:
    if os.path.exists(folder):
        print(f"Deleting folder: {folder}")
        try:
            shutil.rmtree(folder)
        except Exception as e:
            pass

for file in files:
    if os.path.exists(file):
        print(f"Deleting file: {file}")
        try:
            os.remove(file)
        except Exception as e:
            pass

# Deep cleanup of .js files in other folders
for root, dirs, files in os.walk('.'):
    for file in files:
        if file.endswith('.js'):
            try:
                os.remove(os.path.join(root, file))
            except:
                pass

print("Cleanup complete.")
