from django.urls import path
from .views import LMSProxyView, LinkWiseView, SyncWiseStudentsView

urlpatterns = [
    path('details/', LMSProxyView.as_view(), name='lms-details'),
    path('link-student/', LinkWiseView.as_view(), name='link-student-wise'),
    path('sync-students/', SyncWiseStudentsView.as_view(), name='sync-students-wise'),
]
