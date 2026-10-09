# Daily portfolio link checker

Isolated AWS Lambda in Mumbai (`ap-south-1`), deployed October 9, 2026.

- Function and EventBridge Scheduler: `nexus-portfolio-link-checker`.
- Daily run: **09:00 AM IST**, `cron(0 9 * * ? *)`, timezone `Asia/Kolkata`.
- Reads `https://divyarajsinh.com/api/portfolio` on every run, so published changes are discovered automatically.
- Checks home, `/up`, social HTTP(S) links, repositories, live projects, avatar, resume, project covers, and feature screenshots. Excludes authenticated demo routes and mailto links.
- Sends one email to `solanki.divyarajsinhp@gmail.com` for confirmed HTTP failures or network errors after one retry. No email when healthy. HTTP 401/403/429/999 are logged as unverified; they do not prove a broken link. A missing/unavailable portfolio API also triggers an alert.
- No Rails/database writes or application deployment.
- 128 MB ARM64, 180-second maximum run, seven-day CloudWatch log retention. Six parallel checks, at most 100 links, ten-second HTTP timeout. Public HTTP(S) destinations only; redirect destinations are checked too.
- IAM Function URL: `https://7c4m4oo73xhatpyt4dzn2sqit40jshrg.lambda-url.ap-south-1.on.aws/`. Requires AWS-signed requests and returns a dry-run JSON report; it never sends email.
- Scheduler retries are disabled to avoid duplicate daily alerts. Check Lambda error logs if email sending fails; there is no independent checker-failure alarm.
- The account's low concurrency quota prevents reserving one execution. The endpoint is IAM protected and scheduled only once daily.

## Deploy and verify

```bash
python3 -m unittest discover -s infrastructure/portfolio_link_checker -p 'test_*.py'
python3 infrastructure/portfolio_link_checker/deploy.py
aws scheduler get-schedule --region ap-south-1 --name nexus-portfolio-link-checker
aws lambda invoke --region ap-south-1 --function-name nexus-portfolio-link-checker --payload '{"dry_run":true}' /tmp/portfolio-check.json
```

The invoke example works with AWS CLI v1. On CLI v2 add `--cli-binary-format raw-in-base64-out`.
A direct invocation with `{"test_email":true}` sends a clearly labelled setup email.

## Expected incremental monthly cost

30 runs/month. Observed runs take approximately 6–11 seconds. Budget at 10 seconds/run: 37.5 GB-seconds/month at 128 MB. Lambda and Scheduler fit their monthly free allowances when those allowances remain available account-wide. Even without Lambda's allowance, ARM64 compute plus requests are approximately $0.00051/month. At most 30 daily failure emails add approximately $0.003–$0.0048/month at SES à-la-carte/Essentials rates. Tiny logs and response traffic add small usage charges. Budget **less than $0.01/month** for the current 12-link portfolio, excluding existing app charges and taxes. Usage grows with links, latency, and manual invocations; this is an estimate, not a billing cap.

AWS sources: [Lambda](https://aws.amazon.com/lambda/pricing/), [Scheduler](https://aws.amazon.com/eventbridge/pricing/), [SES](https://aws.amazon.com/ses/pricing/).

The AWS Free Tier activity API confirmed the **$20 Lambda reward completed**, and the account credit balance increased from $132.94 to $152.94 during setup.
