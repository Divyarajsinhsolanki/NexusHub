import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import importlib.util
import json
import os
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('monitoring_lambda', pathlib.Path(__file__).with_name('lambda_function.py'))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)

class MonitoringTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'ENVIRONMENT_NAME': 'nexus-hub-prod', 'ALARM_NAMES': json.dumps(['nexus-hub-prod-health']), 'AWS_REGION': 'ap-south-1'})
        self.env.start()
        self.addCleanup(self.env.stop)

    @patch.object(monitor, 'send_email', return_value='message-id')
    def test_deployment_error_sends_ist_report(self, send):
        monitor.lambda_handler({'source': 'aws.elasticbeanstalk', 'time': '2026-10-15T13:45:50Z', 'detail': {'EnvironmentName': 'nexus-hub-prod', 'Severity': 'ERROR', 'Status': 'Environment update failed', 'Message': 'Deployment failed'}}, None)
        send.assert_called_once()
        self.assertIn('19:15:50 IST', send.call_args.args[1])
        self.assertIn('[ALERT]', send.call_args.args[0])

    @patch.object(monitor, 'send_email')
    def test_another_environment_and_success_are_ignored(self, send):
        for name, severity in [('other', 'ERROR'), ('nexus-hub-prod', 'INFO')]:
            monitor.lambda_handler({'source': 'aws.elasticbeanstalk', 'detail': {'EnvironmentName': name, 'Severity': severity}}, None)
        send.assert_not_called()

    @patch.object(monitor, 'send_email', return_value='alarm-id')
    def test_only_scoped_alarm_transitions_send(self, send):
        for name, state in [('other', 'ALARM'), ('nexus-hub-prod-health', 'OK'), ('nexus-hub-prod-health', 'ALARM')]:
            monitor.lambda_handler({'source': 'aws.cloudwatch', 'detail': {'alarmName': name, 'state': {'value': state, 'reason': 'Failure'}}}, None)
        send.assert_called_once()

    @patch.object(monitor, 'send_email', return_value='test-id')
    def test_setup_email_is_explicitly_labeled(self, send):
        report = monitor.lambda_handler({'test_email': True}, None)
        self.assertEqual(report['email_message_id'], 'test-id')
        self.assertTrue(send.call_args.args[0].startswith('[TEST]'))

if __name__ == '__main__':
    unittest.main()
