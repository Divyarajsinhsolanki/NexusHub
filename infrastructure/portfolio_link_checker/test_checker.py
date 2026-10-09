import unittest
from unittest.mock import patch
import urllib.error
import lambda_function as checker

class CheckerTests(unittest.TestCase):
    def test_published_links_deduplicated_and_auth_demo_omitted(self):
        data = {'profile': {'social_links': {'github': 'https://github.com/example', 'mail': 'mailto:a@example.com'}}, 'projects': [{'repository_url': 'https://github.com/example', 'features': [{'demo_path': '/demo/private', 'screenshot_url': '/image.png'}]}]}
        links = checker.extract_links(data)
        self.assertEqual(links.count('https://github.com/example'), 1)
        self.assertIn(checker.BASE_URL + '/image.png', links)
        self.assertNotIn(checker.BASE_URL + '/demo/private', links)
    @patch.object(checker.time, 'sleep')
    @patch.object(checker, 'fetch')
    def test_blocked_link_is_unverified(self, fetch, sleep):
        fetch.side_effect = urllib.error.HTTPError('https://example.com', 403, 'Blocked', {}, None)
        self.assertEqual(checker.check_link('https://example.com')['state'], 'unverified')
    @patch.object(checker.time, 'sleep')
    @patch.object(checker, 'fetch')
    def test_transient_error_retried(self, fetch, sleep):
        fetch.side_effect = [TimeoutError(), 200]
        self.assertEqual(checker.check_link('https://example.com')['state'], 'ok')
    @patch.object(checker, 'send_email', return_value='test-message-id')
    @patch.object(checker, 'fetch', side_effect=RuntimeError('Unavailable'))
    def test_source_failure_alerts(self, fetch, send):
        checker.lambda_handler({}, None)
        send.assert_called_once()
    @patch.object(checker, 'send_email', return_value='test-message-id')
    @patch.object(checker, 'fetch', return_value={})
    @patch.object(checker, 'check_link', return_value={'state': 'ok'})
    def test_healthy_sends_no_email(self, check, fetch, send):
        checker.lambda_handler({}, None)
        send.assert_not_called()
    @patch.object(checker, 'send_email', return_value='test-message-id')
    @patch.object(checker, 'fetch', side_effect=RuntimeError('Unavailable'))
    def test_url_does_not_send_email(self, fetch, send):
        checker.lambda_handler({'requestContext': {}}, None)
        send.assert_not_called()
    @patch.object(checker, 'send_email', return_value='test-message-id')
    @patch.object(checker, 'fetch', return_value={})
    @patch.object(checker, 'check_link', return_value={'url': 'https://example.com', 'state': 'unverified', 'status': 403})
    def test_blocked_sites_do_not_alert_as_failures(self, check, fetch, send):
        report = checker.lambda_handler({}, None)
        send.assert_not_called()
        self.assertEqual(len(report['unverified']), 2)
    @patch.object(checker.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))])
    def test_private_address_rejected(self, dns):
        with self.assertRaises(ValueError):
            checker.validate_url('https://localhost')

if __name__ == '__main__':
    unittest.main()
