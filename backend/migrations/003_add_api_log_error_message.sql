-- Add error_message to api_request_logs for better debugging
ALTER TABLE api_request_logs ADD COLUMN error_message TEXT;
