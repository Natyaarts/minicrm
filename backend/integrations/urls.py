from django.urls import path
from .views import (
    LMSProxyView, LinkWiseView, SyncWiseStudentsView, 
    WiseCourseListView, ConsumeWiseCreditsView, IntegrationSettingViewSet,
    RazorpayOrderView, WiseClassStudentsView, SyncWiseBatchView
)

urlpatterns = [
    path('details/', LMSProxyView.as_view(), name='lms-details'),
    path('link-student/', LinkWiseView.as_view(), name='link-student-wise'),
    path('sync-students/', SyncWiseStudentsView.as_view(), name='sync-students-wise'),
    path('courses/', WiseCourseListView.as_view(), name='wise-courses'),
    path('courses/<str:class_id>/participants/', WiseClassStudentsView.as_view(), name='wise-class-students'),
    path('sync-batch/', SyncWiseBatchView.as_view(), name='sync-batch'),
    path('consume-credits/', ConsumeWiseCreditsView.as_view(), name='consume-credits'),
    path('settings/', IntegrationSettingViewSet.as_view(), name='integration-settings'),
    path('razorpay/order/', RazorpayOrderView.as_view(), name='razorpay-order'),
]
