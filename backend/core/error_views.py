"""
Global Django HTTP Error Views (VA-005 Remediation).
Provides safe, sanitized JSON responses for API routes and clean error responses for non-API routes.
"""

from django.http import JsonResponse, HttpResponse


def custom_bad_request_view(request, exception=None):
    """Handler for 400 Bad Request."""
    if request.path.startswith('/api/') or request.headers.get('Accept') == 'application/json':
        return JsonResponse({'error': 'Bad request.', 'status_code': 400}, status=400)
    return HttpResponse("Bad Request (400)", status=400, content_type="text/plain")


def custom_permission_denied_view(request, exception=None):
    """Handler for 403 Forbidden."""
    if request.path.startswith('/api/') or request.headers.get('Accept') == 'application/json':
        return JsonResponse({'error': 'Permission denied.', 'status_code': 403}, status=403)
    return HttpResponse("Permission Denied (403)", status=403, content_type="text/plain")


def custom_page_not_found_view(request, exception=None):
    """Handler for 404 Not Found."""
    if request.path.startswith('/api/') or request.headers.get('Accept') == 'application/json':
        return JsonResponse({'error': 'Resource not found.', 'status_code': 404}, status=404)
    return HttpResponse("Not Found (404)", status=404, content_type="text/plain")


def custom_server_error_view(request):
    """Handler for 500 Server Error."""
    if request.path.startswith('/api/') or request.headers.get('Accept') == 'application/json':
        return JsonResponse({'error': 'An internal server error occurred. Please try again later.', 'status_code': 500}, status=500)
    return HttpResponse("Server Error (500)", status=500, content_type="text/plain")
