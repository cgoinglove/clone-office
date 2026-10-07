// Memory is written into every future session's prompt, so a poisoned entry would persist. Writes
// are scanned for prompt injection, exfiltration and backdoor patterns, and invisible unicode.
// Ported from Hermes Agent (tools/threat_patterns.py, "strict" scope, MIT, Nous Research): the
// patterns anchor on attack vocabulary, not bossy English, so ordinary work notes pass.

const FILLER = String.raw`(?:\w+\s+){0,8}`;
const SECRET_VAR = String.raw`\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?\b`;
const MODIFY = String.raw`(update|modify|edit|write|change|append|add\s+to)\s+[^\n]{0,2048}`;

const PATTERNS: [source: string, id: string, flags?: string][] = [
  // Classic prompt injection.
  [
    String.raw`ignore\s+${FILLER}(previous|all|above|prior)\s+${FILLER}instructions`,
    "prompt_injection",
  ],
  [String.raw`system\s+prompt\s+override`, "sys_prompt_override"],
  [
    String.raw`disregard\s+${FILLER}(your|all|any)\s+${FILLER}(instructions|rules|guidelines)`,
    "disregard_rules",
  ],
  [
    String.raw`act\s+as\s+(if|though)\s+${FILLER}you\s+${FILLER}(have\s+no|don't\s+have)\s+${FILLER}(restrictions|limits|rules)`,
    "bypass_restrictions",
  ],
  [
    String.raw`<!--[^>]{0,512}(?:ignore|override|system|secret|hidden)[^>]{0,512}-->`,
    "html_comment_injection",
  ],
  [
    String.raw`<\s*div\s+style\s*=\s*["'][^>]{0,2048}display\s*:\s*none`,
    "hidden_div",
  ],
  [
    String.raw`translate\s+[^\n]{0,512}\s+into\s+\w+(?:[\s-]+\w+){0,2}\s+and\s+(execute|run|eval)\b`,
    "translate_execute",
  ],
  [
    String.raw`do\s+not\s+${FILLER}tell\s+${FILLER}the\s+user`,
    "deception_hide",
  ],
  // Role and identity hijack.
  [String.raw`you\s+are\s+${FILLER}now\s+(?:a|an|the)\s+`, "role_hijack"],
  [String.raw`pretend\s+${FILLER}(you\s+are|to\s+be)\s+`, "role_pretend"],
  [
    String.raw`output\s+${FILLER}(system|initial)\s+prompt`,
    "leak_system_prompt",
  ],
  [
    String.raw`(respond|answer|reply)\s+without\s+${FILLER}(restrictions|limitations|filters|safety)`,
    "remove_filters",
  ],
  [
    String.raw`you\s+have\s+been\s+${FILLER}(updated|upgraded|patched)\s+to`,
    "fake_update",
  ],
  [String.raw`\bname\s+yourself\s+\w+`, "identity_override"],
  // Command-and-control promptware.
  [String.raw`register\s+(as\s+)?a?\s*node`, "c2_node_registration"],
  [
    String.raw`(heartbeat|beacon|check[\s\-]?in)\s+(to|with)\s+`,
    "c2_heartbeat",
  ],
  [String.raw`pull\s+(down\s+)?(?:new\s+)?task(?:ing|s)?\b`, "c2_task_pull"],
  [String.raw`connect\s+to\s+the\s+network\b`, "c2_network_connect"],
  [
    String.raw`you\s+must\s+(?:\w+\s+){0,3}(register|connect|report|beacon)\b`,
    "forced_action",
  ],
  [String.raw`only\s+use\s+one[\s\-]?liners?\b`, "anti_forensic_oneliner"],
  [
    String.raw`never\s+${FILLER}(?:create|write)\s+${FILLER}(?:script|file)\s+${FILLER}disk`,
    "anti_forensic_disk",
  ],
  [
    String.raw`unset\s+\w*(?:CLAUDE|CODEX|HERMES|AGENT|OPENAI|ANTHROPIC)\w*`,
    "env_var_unset_agent",
  ],
  [
    String.raw`\b(?:cobalt\s*strike|sliver|havoc|mythic|metasploit|brainworm)\b`,
    "known_c2_framework",
  ],
  [
    String.raw`\bc2\s+(?:server|channel|infrastructure|beacon)\b`,
    "c2_explicit",
  ],
  [String.raw`\bcommand\s+and\s+control\b`, "c2_explicit_long"],
  // Exfiltration.
  [String.raw`curl\s+[^\n]{0,2048}${SECRET_VAR}`, "exfil_curl"],
  [String.raw`wget\s+[^\n]{0,2048}${SECRET_VAR}`, "exfil_wget"],
  [
    String.raw`cat\s+[^\n]{0,2048}(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)`,
    "read_secrets",
  ],
  [
    String.raw`(send|post|upload|transmit)\s+[^\n]{0,2048}\s+(to|at)\s+https?://`,
    "send_to_url",
  ],
  [
    String.raw`(include|output|print|share)\s+${FILLER}(conversation|chat\s+history|previous\s+messages|full\s+context|entire\s+context)`,
    "context_exfil",
  ],
  // Persistence and agent-config tampering.
  [String.raw`authorized_keys`, "ssh_backdoor"],
  // This app's own secrets: the brain's keys, connectors' tokens, the settings with the office's.
  [
    String.raw`(?:\$HOME|~|\.sub-office)/(?:\.sub-office/)?(?:brain/keys\.json|brain/chatgpt\.json|connectors/|settings\.json)`,
    "sub_office_secrets",
  ],
  [
    String.raw`(?:\b(?:echo|cat|cp|mv|dd|tee|install|printf|rsync|scp|ln|append|add|write|sed|chmod|chown|truncate|rm|touch|curl|wget|git)\b|\bopen\s*\(|>>?)[^\n]{0,512}(?:\$HOME/\.ssh|~/\.ssh)`,
    "ssh_access",
  ],
  [
    String.raw`${MODIFY}(?:AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules)`,
    "agent_config_mod",
  ],
  // A hardcoded secret, unless the value is itself an environment variable's name. The name test
  // is case-sensitive, so this one is matched without the "i" flag and spells its words in both
  // cases (inline modifiers such as (?-i:) need Node 23).
  [
    String.raw`(?:[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]|[Tt][Oo][Kk][Ee][Nn]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd])\s*[=:]\s*["'](?![A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+["'])[A-Za-z0-9+/=_-]{20,}`,
    "hardcoded_secret",
    "",
  ],
];

const COMPILED = PATTERNS.map(
  ([source, id, flags = "i"]) => [new RegExp(source, flags), id] as const,
);

/** Zero-width, word-joiner, invisible operator, BOM and bidirectional control characters. */
const INVISIBLE = new Set("​‌‍⁠⁢⁣⁤﻿‪‫‬‭‮⁦⁧⁨⁩");

/** Scanners are advisory; a cap bounds their worst-case time. */
const MAX_SCAN_CHARS = 65_536;

export function scanForThreats(content: string): string[] {
  if (!content) return [];
  const text = content.slice(0, MAX_SCAN_CHARS);
  const found = [...new Set(text)]
    .filter((ch) => INVISIBLE.has(ch))
    .map(
      (ch) =>
        `invisible_unicode_U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`,
    );
  // NFKC folds full-width look-alikes ("ｃａｔ" → "cat") before matching.
  const normalised = text.normalize("NFKC");
  for (const [pattern, id] of COMPILED)
    if (pattern.test(normalised)) found.push(id);
  return found;
}

/** The error a write gets for the first threat found, or undefined. */
export function threatMessage(content: string): string | undefined {
  const first = scanForThreats(content)[0];
  if (!first) return undefined;
  if (first.startsWith("invisible_unicode_"))
    return `Blocked: content contains invisible unicode character ${first.slice("invisible_unicode_".length)} (possible injection).`;
  return `Blocked: content matches threat pattern '${first}'. Content is injected into the system prompt and must not contain injection or exfiltration payloads.`;
}
