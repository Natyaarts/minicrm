
from rest_framework import status, views, viewsets, generics, filters
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, logout as django_logout
from .serializers import UserSerializer, RolePermissionSerializer
from .models import RolePermission
from rest_framework.permissions import IsAuthenticated, AllowAny
from .permissions import IsAdminOrSuperAdmin
from .authentication import get_token_ttl
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.contrib.auth import get_user_model

from core.throttling import LoginRateThrottle, PasswordChangeRateThrottle

User = get_user_model()

class LoginView(views.APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # No CSRF enforcement for public login endpoint
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        # Prevent credentials from being supplied via URL query parameters (VA-002)
        if request.query_params.get('password') or request.query_params.get('username'):
            return Response(
                {'error': 'Credentials must not be passed in URL query parameters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        username = request.data.get('username')
        password = request.data.get('password')
        
        if not username or not password:
            return Response({'error': 'Invalid Credentials'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        
        if user:
            # Clear any pre-existing session to prevent session fixation / stale session reuse (VA-012)
            if hasattr(request, 'session') and request.session:
                request.session.flush()

            # Token Rotation: Delete any existing token so previous sessions are invalidated
            Token.objects.filter(user=user).delete()

            # Create fresh token with current timestamp
            token = Token.objects.create(user=user)
            serializer = UserSerializer(user, context={'request': request})
            ttl_seconds = int(get_token_ttl().total_seconds())

            return Response({
                'token': token.key,
                'user': serializer.data,
                'expires_in': ttl_seconds
            })
        return Response({'error': 'Invalid Credentials'}, status=status.HTTP_400_BAD_REQUEST)

class LogoutView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Invalidates the authenticated user's session token and Django session on the server (VA-012).
        """
        # 1. Server-side DRF Token revocation
        if request.auth and isinstance(request.auth, Token):
            request.auth.delete()
        elif request.user and request.user.is_authenticated:
            Token.objects.filter(user=request.user).delete()

        # 2. Server-side Django Session invalidation
        if hasattr(request, 'session') and request.session:
            request.session.flush()
        if request.user and request.user.is_authenticated:
            django_logout(request)

        return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)

class PasswordChangeView(views.APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [PasswordChangeRateThrottle]

    def post(self, request):
        """
        Allows authenticated users to securely change their password (VA-002 & VA-012).
        Requires old_password and new_password in request payload body.
        Rotates authentication token upon password change and invalidates previous sessions.
        """
        if request.query_params.get('password') or request.query_params.get('old_password') or request.query_params.get('new_password'):
            return Response(
                {'error': 'Passwords must not be passed in URL query parameters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')

        if not old_password or not new_password:
            return Response({'error': 'Old password and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not user.check_password(old_password):
            return Response({'error': 'Invalid current password.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        # Invalidate old tokens and issue fresh token
        Token.objects.filter(user=user).delete()
        new_token = Token.objects.create(user=user)

        # Invalidate any old Django session
        if hasattr(request, 'session') and request.session:
            request.session.flush()

        return Response({
            'status': 'Password changed successfully.',
            'token': new_token.key
        }, status=status.HTTP_200_OK)

class UserDetailView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email', 'first_name', 'last_name']

    def get_queryset(self):
        user = self.request.user
        if not (user.is_authenticated and (user.role in ['ADMIN', 'SUPER_ADMIN'] or user.is_superuser)):
            return User.objects.none()

        queryset = User.objects.all().order_by('-id')
        role = self.request.query_params.get('role')
        if role:
            if role == 'ADMIN':
                queryset = queryset.filter(role__in=['ADMIN', 'SUPER_ADMIN', 'ACADEMIC', 'ACADEMIC_COORDINATOR', 'SALES', 'MENTOR'])
            else:
                queryset = queryset.filter(role=role)
        return queryset.order_by('-id')

    def perform_create(self, serializer):
        req_user = self.request.user
        role = serializer.validated_data.get('role')
        if req_user.role == 'ADMIN' and not req_user.is_superuser:
            if role == 'SUPER_ADMIN' or serializer.validated_data.get('is_superuser'):
                raise PermissionDenied("Admins cannot create Super Admin or superuser accounts.")
        serializer.save()

    def perform_update(self, serializer):
        req_user = self.request.user
        target_user = serializer.instance
        if req_user.role == 'ADMIN' and not req_user.is_superuser:
            if target_user.role == 'SUPER_ADMIN':
                raise PermissionDenied("Admins cannot modify Super Admin accounts.")
            if serializer.validated_data.get('role') == 'SUPER_ADMIN':
                raise PermissionDenied("Admins cannot promote users to Super Admin.")
            if serializer.validated_data.get('is_superuser'):
                raise PermissionDenied("Admins cannot grant superuser status.")
        serializer.save()

    def perform_destroy(self, instance):
        req_user = self.request.user
        if instance == req_user:
            raise ValidationError("You cannot delete your own account.")
        if instance.role == 'SUPER_ADMIN' and req_user.role != 'SUPER_ADMIN' and not req_user.is_superuser:
            raise PermissionDenied("Only Super Admins can delete Super Admin accounts.")
        instance.delete()

class MentorListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(role='MENTOR')

class TeacherListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(role='TEACHER')

from core.permissions import DynamicRolePermission

class TeacherViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    module_name = 'ACADEMIC'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [DynamicRolePermission()]

    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email']

    def get_queryset(self):
        # Allow TEACHER, MENTOR, and ACADEMIC roles to be listed as "Faculty" in the Academic Module
        return User.objects.filter(role__in=['TEACHER', 'MENTOR', 'ACADEMIC', 'ACADEMIC_COORDINATOR']).order_by('-id')

    def perform_create(self, serializer):
        # Force role to TEACHER and set a default password if not provided
        user = serializer.save(role='TEACHER')
        if not user.password:
            user.set_password('welcome123')
            user.save()

class RolePermissionViewSet(viewsets.ModelViewSet):
    queryset = RolePermission.objects.all()
    serializer_class = RolePermissionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        user = self.request.user
        if not (user.is_authenticated and (user.role in ['ADMIN', 'SUPER_ADMIN'] or user.is_superuser)):
            return RolePermission.objects.none()

        role = self.request.query_params.get('role')
        if role:
            return RolePermission.objects.filter(role=role).order_by('id')
        return RolePermission.objects.all().order_by('id')


class ExpoTokenView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('token')
        if token:
            request.user.expo_push_token = token
            request.user.save()
            return Response({'status': 'token saved successfully'})
        return Response({'error': 'Token not provided'}, status=status.HTTP_400_BAD_REQUEST)

