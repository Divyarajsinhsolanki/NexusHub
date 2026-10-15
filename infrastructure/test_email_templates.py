import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from email_templates import render_email


class EmailTemplateTests(unittest.TestCase):
    def test_escapes_dynamic_alert_content_and_preserves_links(self):
        rendered = render_email('[ALERT] Production <failure>', '<script>alert(1)</script>\nCloudWatch logs: https://example.com/logs?a=1&b=2')
        self.assertNotIn('<script>', rendered)
        self.assertIn('&lt;script&gt;', rendered)
        self.assertIn('ACTION REQUIRED', rendered)
        self.assertIn('href="https://example.com/logs?a=1&amp;b=2"', rendered)

    def test_statuses_distinguish_unverified_results_from_confirmed_failures(self):
        html = render_email('Portfolio link check complete: no confirmed failures', 'UNVERIFIED: https://example.com — 403\nOK: https://example.org — 200')
        self.assertIn('REVIEW UNVERIFIED LINKS', html)
        self.assertIn('Link results', html)
        self.assertIn('403', html)
        self.assertNotIn('ACTION REQUIRED', html)
        self.assertIn('SETUP TEST', render_email('[TEST] Monitoring setup', 'Test only'))
        self.assertIn('CHECK COMPLETE', render_email('Portfolio link check successful', 'All passed'))

    def test_invalid_urls_do_not_break_alert_delivery(self):
        self.assertIn('https://[invalid', render_email('[ALERT] Exception', 'URL https://[invalid'))
        self.assertNotIn('href="https://user:password', render_email('Report', 'https://user:password@example.com'))

    def test_both_lambda_senders_include_html_and_original_text(self):
        for folder in ('production_monitoring', 'portfolio_link_checker'):
            with self.subTest(folder=folder):
                spec = importlib.util.spec_from_file_location(folder, Path(__file__).parent / folder / 'lambda_function.py')
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                ses = Mock()
                ses.send_email.return_value = {'MessageId': 'test-only'}
                boto3 = types.SimpleNamespace(client=Mock(return_value=ses))
                env = {'AWS_REGION': 'ap-south-1', 'SENDER_EMAIL': 'sender@example.test', 'ALERT_EMAIL': 'recipient@example.test'}
                with patch.dict(sys.modules, {'boto3': boto3}), patch.dict(os.environ, env):
                    module.send_email('[TEST] Sample', 'Original text body')
                body = ses.send_email.call_args.kwargs['Message']['Body']
                self.assertEqual(body['Text']['Data'], 'Original text body')
                self.assertIn('Original text body', body['Html']['Data'])
                self.assertIn('Nexus', body['Html']['Data'])

    def test_deployment_archives_include_the_renderer(self):
        for folder in ('production_monitoring', 'portfolio_link_checker'):
            source = (Path(__file__).parent / folder / 'deploy.py').read_text()
            self.assertIn("HERE.parent / 'email_templates.py', 'email_templates.py'", source)


if __name__ == '__main__':
    unittest.main()
