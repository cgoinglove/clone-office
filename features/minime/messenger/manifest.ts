// The Slack app the person makes at api.slack.com/apps from a manifest, with exactly the scopes
// slack.ts uses: its Messages tab to talk in, reading and writing there, opening it to write
// first, the person's name, and files sent there both ways. Apart from slack.ts so the page can
// copy it without the bot.

export const SLACK_MANIFEST = `display_information:
  name: clone
features:
  app_home:
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  bot_user:
    display_name: clone
    always_online: true
oauth_config:
  scopes:
    bot: [chat:write, im:history, im:read, im:write, users:read, files:read, files:write]
settings:
  event_subscriptions:
    bot_events: [message.im]
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
`;
