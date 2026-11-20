from django.apps import AppConfig


class CrmConfig(AppConfig):
    name = 'crm'

    def ready(self):
        from . import signals  # noqa
        from . import reminder_signals  # noqa  (follow-up push: reset reminder on due_date change)