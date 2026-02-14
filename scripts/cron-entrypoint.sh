#!/bin/sh
# Write crontab with environment variables expanded at runtime
cat <<EOF | crontab -
# Dispatch pending scheduled notifications every 2 minutes
*/2 * * * * wget -qO- --header="Authorization: Bearer ${NOTIFICATION_DISPATCH_SECRET}" --post-data="" http://app:3000/api/admin/notifications/dispatch > /proc/1/fd/1 2>&1
EOF

echo "Cron entrypoint: crontab installed, starting crond"
exec crond -f -l 2
