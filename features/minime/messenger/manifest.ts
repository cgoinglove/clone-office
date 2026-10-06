// The Slack app the person makes at api.slack.com/apps from a manifest, with exactly the scopes
// slack.ts uses: its Messages tab to talk in, reading and writing there, opening it to write
// first, and the person's name. Apart from slack.ts so the page can copy it without the bot.

export const SLACK_MANIFEST = `display_information:
  name: mini-me
features:
  app_home:
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  bot_user:
    display_name: mini-me
    always_online: true
oauth_config:
  scopes:
    bot: [chat:write, im:history, im:read, im:write, users:read]
settings:
  event_subscriptions:
    bot_events: [message.im]
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
`;
