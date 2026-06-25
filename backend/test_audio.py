import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from crm.models import LeadInteraction
from django.core.files.uploadedfile import SimpleUploadedFile

inter = LeadInteraction.objects.first()
if inter:
    print("Found interaction:", inter.id)
    file_content = b'dummy audio data'
    uploaded = SimpleUploadedFile("test_audio.m4a", file_content, content_type="audio/m4a")
    inter.audio_recording = uploaded
    inter.save()
    print("Saved audio recording:", inter.audio_recording.url)
else:
    print("No interaction found")
