"""
Centralized Exception Handling for Django REST Framework (VA-005 Remediation).
Sanitizes all API exception responses to guarantee that no sensitive implementation
details (such as stack traces, database schema/constraints, filesystem paths,
passwords, tokens, or internal error messages) are exposed to clients.
"""

import logging
import re
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, DatabaseError, OperationalError, DataError
from django.http import Http404
from rest_framework import status
from rest_framework.views import exception_handler
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Patterns that might expose internal paths, module names, or database internals
SENSITIVE_PATTERNS = [
    re.compile(r'[a-zA-Z]:\\[\\\w\s.-]+', re.IGNORECASE),  # Windows paths
    re.compile(r'/(?:home|var|etc|usr|tmp|Users)/[\w\s/.-]+', re.IGNORECASE),  # Unix paths
    re.compile(r'django\.(?:db|core|contrib)\.[\w.]+', re.IGNORECASE),  # Django internal classes
    re.compile(r'OperationalError|IntegrityError|DatabaseError', re.IGNORECASE),  # DB errors
    re.compile(r'Traceback \(most recent call last\):', re.IGNORECASE),  # Python tracebacks
    re.compile(r'File ".*?", line \d+', re.IGNORECASE),  # Traceback line pointers
]


def sanitize_message(msg):
    """
    Sanitize error message to ensure no file paths, internal module names, or SQL fragments are leaked.
    """
    if not isinstance(msg, str):
        return msg
    if re.search(r'JSON parse error', msg, re.IGNORECASE):
        return "Malformed JSON payload. Please verify syntax."
    for pattern in SENSITIVE_PATTERNS:
        if pattern.search(msg):
            return "Invalid request parameter or input data."
    return msg


def sanitize_error_data(data):
    """
    Recursively sanitize error dictionary or list data structures.
    """
    if isinstance(data, dict):
        return {k: sanitize_error_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_error_data(item) for item in data]
    elif isinstance(data, str):
        return sanitize_message(data)
    return data


def custom_exception_handler(exc, context):
    """
    Centralized DRF exception handler.
    1. Intercepts DRF APIExceptions and standardizes/sanitizes response payloads.
    2. Catches unhandled Python exceptions (500), logs full details server-side,
       and returns a clean, generic JSON error payload to the client.
    3. Handles database IntegrityError / DatabaseError safely without leaking schema.
    """
    # First, let standard DRF handler attempt to process
    response = exception_handler(exc, context)

    # Get request metadata for server-side logging
    request = context.get('request') if context else None
    view = context.get('view') if context else None
    view_name = view.__class__.__name__ if view else 'UnknownView'
    path = request.path if request else 'UnknownPath'
    method = request.method if request else 'UnknownMethod'

    if response is not None:
        # Standard DRF exception recognized
        if response.status_code >= 500:
            logger.error(
                f"API Server Error ({response.status_code}) at {method} {path} in {view_name}: {exc}",
                exc_info=True
            )
        elif response.status_code == 401:
            logger.info(f"Unauthenticated request at {method} {path}")
        elif response.status_code == 403:
            user_id = getattr(getattr(request, 'user', None), 'id', 'Anonymous')
            logger.warning(f"Permission denied for user {user_id} at {method} {path}")
        elif response.status_code == 429:
            user_id = getattr(getattr(request, 'user', None), 'id', 'Anonymous')
            logger.warning(f"Rate limit exceeded for user/IP {user_id} at {method} {path}")
            wait_seconds = getattr(exc, 'wait', None)
            response.data = {
                'error': 'Too many requests. Please try again later.',
                'status_code': 429
            }
            if wait_seconds is not None:
                response.data['available_in'] = int(wait_seconds)
            return response

        # Sanitize data to prevent internal leakage in validation messages
        response.data = sanitize_error_data(response.data)

        # Standardize structure if response.data is a dict
        if isinstance(response.data, dict):
            if 'detail' in response.data and 'error' not in response.data:
                response.data['error'] = response.data['detail']
        elif isinstance(response.data, list):
            response.data = {'error': 'Validation error', 'details': response.data}

        return response

    # Unhandled Exception (response is None)
    # Log the full traceback securely on the server
    logger.error(
        f"Unhandled Exception at {method} {path} in {view_name}: {exc}",
        exc_info=True
    )

    # Handle Django model ValidationError
    if isinstance(exc, DjangoValidationError):
        details = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages
        return Response(
            {
                'error': 'Validation error',
                'details': sanitize_error_data(details)
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Handle Database / Integrity Errors (e.g. unique constraint, foreign key, connection error)
    if isinstance(exc, (IntegrityError, DatabaseError, OperationalError, DataError)):
        return Response(
            {
                'error': 'A database constraint error occurred. Please verify input data.',
                'status_code': status.HTTP_400_BAD_REQUEST
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Handle Http404 outside standard DRF flow
    if isinstance(exc, Http404):
        return Response(
            {
                'error': 'Resource not found.',
                'status_code': status.HTTP_404_NOT_FOUND
            },
            status=status.HTTP_404_NOT_FOUND
        )

    # All other unhandled server exceptions -> Generic 500 JSON
    return Response(
        {
            'error': 'An internal server error occurred. Please try again later.',
            'status_code': status.HTTP_500_INTERNAL_SERVER_ERROR
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
