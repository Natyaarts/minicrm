import os
from django.conf import settings
from django.http import Http404, HttpResponse
from django.views.static import serve as django_static_serve

# Dangerous file extensions that must never be rendered inline in the browser
FORCED_DOWNLOAD_EXTENSIONS = {
    '.svg', '.svgz', '.html', '.htm', '.xhtml', '.shtml',
    '.xml', '.js', '.mjs', '.vbs', '.jsp', '.asp', '.aspx',
    '.php', '.exe', '.bat', '.cmd', '.sh', '.bin', '.dll'
}


def safe_media_serve(request, path, document_root=None, show_indexes=False):
    """
    Secure file serving wrapper around django.views.static.serve:
    1. Sets strict security headers (nosniff, CSP sandbox, X-Frame-Options).
    2. Prevents active scripts/SVG/HTML from executing in the application's origin.
    3. Forces Content-Disposition: attachment and Content-Type: application/octet-stream
       for any potentially executable or markup files (e.g. SVG, HTML).
    """
    if document_root is None:
        document_root = settings.MEDIA_ROOT

    # Serve the file using Django's static serve
    response = django_static_serve(request, path, document_root=document_root, show_indexes=show_indexes)

    # Attach baseline security headers
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self';"
    response['X-Frame-Options'] = 'SAMEORIGIN'

    ext = os.path.splitext(path)[1].lower()
    content_type = response.get('Content-Type', '').lower().split(';')[0].strip()

    # If file is SVG or potentially active content, force download and strip active mime type
    if ext in FORCED_DOWNLOAD_EXTENSIONS or content_type in ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml']:
        filename = os.path.basename(path)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Type'] = 'application/octet-stream'

    return response
