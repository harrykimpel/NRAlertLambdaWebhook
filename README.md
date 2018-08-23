# New Relic Alert Lambda Webhook for Slack
An AWS Lambda function to receive NR alerts, generate new content and send to Slack webhook.

The Lambda function leverages two environment variables:

1. NR_INSIGHTS_QUERY_KEY: a New Relic Insights Query Key within your account

2. SLACK_WEBHOOCK_PATH: the path of your incoming Slack webhook. The complete path looks something like this: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX. The content of this environment variable should just look like this '/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'.

3. DYNAMO_DB_TABLE_NAME: the name of the DynamoDB table to store violation occurrences; DynamoDB table must have following columns: 
          - alert_timestamp (KEY), S
          - alert_date, S
          - alert_condition_id, N
