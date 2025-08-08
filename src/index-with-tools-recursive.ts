// ABOUTME: Enhanced version with recursive tool calling support
// ABOUTME: Handles multiple rounds of tool calls and parameter name variations

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from 'dotenv';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client, GatewayIntentBits, TextChannel, Message, Partials } from 'discord.js';
import { z } from 'zod';
import fetch from 'node-fetch';

dotenv.config();

// Discord client setup with additional intents for message handling
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel, // Required for DM channels
    Partials.Message, // Required for DM messages
  ],
});

// LLM Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'anthropic/claude-3.5-sonnet';

// Define tools in OpenAI function format for the LLM
const discordTools = [
  {
    type: 'function',
    function: {
      name: 'read_messages',
      description: 'Read recent messages from a Discord channel',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel name (e.g., "general" or "#general") or channel ID',
          },
          limit: {
            type: 'number',
            description: 'Number of messages to fetch (max 100)',
            default: 50,
          },
          server: {
            type: 'string',
            description: 'Server name or ID (optional if bot is only in one server)',
          },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_servers',
      description: 'List all Discord servers and channels the bot has access to',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a Discord channel',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel name or ID',
          },
          message: {
            type: 'string',
            description: 'Message content to send',
          },
          server: {
            type: 'string',
            description: 'Server name or ID (optional)',
          },
        },
        required: ['channel', 'message'],
      },
    },
  },
];

// Helper function to find a guild by name or ID
async function findGuild(guildIdentifier?: string) {
  if (!guildIdentifier) {
    if (client.guilds.cache.size === 1) {
      return client.guilds.cache.first()!;
    }
    throw new Error(`Bot is in ${client.guilds.cache.size} servers. Please specify server name or ID.`);
  }

  try {
    const guild = await client.guilds.fetch(guildIdentifier);
    if (guild) return guild;
  } catch {
    const guilds = client.guilds.cache.filter(
      g => g.name.toLowerCase() === guildIdentifier.toLowerCase()
    );
    
    if (guilds.size === 0) {
      throw new Error(`Server "${guildIdentifier}" not found.`);
    }
    if (guilds.size > 1) {
      const guildList = guilds.map(g => `${g.name} (ID: ${g.id})`).join(', ');
      throw new Error(`Multiple servers found with name "${guildIdentifier}": ${guildList}`);
    }
    return guilds.first()!;
  }
  throw new Error(`Server "${guildIdentifier}" not found`);
}

// Helper function to find a channel by name or ID within a specific guild
async function findChannel(channelIdentifier: string, guildIdentifier?: string): Promise<TextChannel> {
  const guild = await findGuild(guildIdentifier);
  
  // Clean the channel identifier (remove # if present)
  const cleanChannelName = channelIdentifier.replace(/^#/, '');
  
  try {
    const channel = await client.channels.fetch(cleanChannelName);
    if (channel instanceof TextChannel && channel.guild.id === guild.id) {
      return channel;
    }
  } catch {
    const channels = guild.channels.cache.filter(
      (channel): channel is TextChannel =>
        channel instanceof TextChannel &&
        (channel.name.toLowerCase() === cleanChannelName.toLowerCase())
    );

    if (channels.size === 0) {
      throw new Error(`Channel "${channelIdentifier}" not found in server "${guild.name}".`);
    }
    if (channels.size > 1) {
      const channelList = channels.map(c => `#${c.name} (${c.id})`).join(', ');
      throw new Error(`Multiple channels found with name "${channelIdentifier}": ${channelList}`);
    }
    return channels.first()!;
  }
  throw new Error(`Channel "${channelIdentifier}" not found`);
}

// Normalize tool arguments to handle variations in parameter names
function normalizeToolArgs(toolName: string, args: any): any {
  const normalized = { ...args };
  
  // Map common variations to standard names
  const mappings: Record<string, Record<string, string>> = {
    read_messages: {
      'channel_name': 'channel',
      'server_name': 'server',
      'message_limit': 'limit',
      'max_messages': 'limit',
    },
    send_message: {
      'channel_name': 'channel',
      'server_name': 'server',
      'content': 'message',
      'text': 'message',
    },
  };
  
  if (mappings[toolName]) {
    for (const [wrongName, correctName] of Object.entries(mappings[toolName])) {
      if (wrongName in normalized && !(correctName in normalized)) {
        normalized[correctName] = normalized[wrongName];
        delete normalized[wrongName];
      }
    }
  }
  
  // Remove any parameters that aren't recognized (like start_date, end_date)
  const validParams: Record<string, string[]> = {
    read_messages: ['channel', 'server', 'limit'],
    send_message: ['channel', 'server', 'message'],
    list_servers: [],
  };
  
  if (validParams[toolName]) {
    for (const key of Object.keys(normalized)) {
      if (!validParams[toolName].includes(key)) {
        console.error(`Removing unrecognized parameter: ${key}`);
        delete normalized[key];
      }
    }
  }
  
  return normalized;
}

// Execute Discord tools - reuses existing logic
async function executeDiscordTool(toolName: string, args: any): Promise<string> {
  try {
    // Normalize arguments first
    const normalizedArgs = normalizeToolArgs(toolName, args);
    
    switch (toolName) {
      case 'list_servers': {
        const servers = Array.from(client.guilds.cache.values()).map(guild => ({
          name: guild.name,
          id: guild.id,
          memberCount: guild.memberCount,
          channels: guild.channels.cache
            .filter((c): c is TextChannel => c instanceof TextChannel)
            .map(c => `#${c.name}`)
            .slice(0, 20), // Limit channels shown
        }));
        
        return JSON.stringify(servers, null, 2);
      }

      case 'read_messages': {
        const { channel: channelIdentifier, limit = 50, server } = normalizedArgs;
        const channel = await findChannel(channelIdentifier, server);
        
        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
        const formattedMessages = Array.from(messages.values())
          .reverse() // Show oldest first
          .map(msg => ({
            author: msg.author.tag,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            attachments: msg.attachments.map(a => a.url),
          }));

        return `Messages from #${channel.name} in ${channel.guild.name}:\n${JSON.stringify(formattedMessages, null, 2)}`;
      }

      case 'send_message': {
        const { channel: channelIdentifier, message, server } = normalizedArgs;
        const channel = await findChannel(channelIdentifier, server);
        
        const sent = await channel.send(message);
        return `Message sent successfully to #${channel.name} in ${channel.guild.name}. Message ID: ${sent.id}`;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    return `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Recursive tool calling with depth limit
async function executeToolsRecursively(
  messages: any[], 
  assistantMessage: any,
  depth: number = 0
): Promise<string> {
  const MAX_DEPTH = 5; // Prevent infinite loops
  
  if (depth >= MAX_DEPTH) {
    console.error(`Max tool calling depth (${MAX_DEPTH}) reached`);
    return assistantMessage.reasoning || assistantMessage.content || 'Maximum tool calling depth reached.';
  }
  
  if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
    // Check if content looks like a tool call attempt (JSON)
    let content = assistantMessage.content;
    
    if (content && content.trim().startsWith('{') && content.includes('"channel"')) {
      console.error('Detected JSON in content, attempting to parse as tool call...');
      try {
        const args = JSON.parse(content);
        // Assume it's a read_messages call if it has channel
        const toolName = args.message ? 'send_message' : 'read_messages';
        
        console.error(`Converting to ${toolName} tool call with args:`, args);
        
        // Create a synthetic tool call
        const syntheticToolCall = {
          tool_calls: [{
            id: 'synthetic_' + Date.now(),
            function: {
              name: toolName,
              arguments: JSON.stringify(args)
            },
            type: 'function'
          }]
        };
        
        // Recursively execute this synthetic tool call
        return executeToolsRecursively(messages, syntheticToolCall, depth);
      } catch (e) {
        console.error('Failed to parse JSON from content:', e);
        // Fall through to normal content handling
      }
    }
    
    // Clean up GPT-OSS reasoning artifacts
    if (content) {
      content = content.replace(/^(analysis|assistant|commentary|final).*?(?=\*\*|[A-Z])/gs, '');
      content = content.trim();
    }
    
    if (!content || content === '') {
      content = assistantMessage.reasoning || 'I processed your request.';
    }
    
    return content;
  }
  
  console.error(`===== EXECUTING TOOLS (Round ${depth + 1}) =====`);
  const toolResults = [];
  
  for (const toolCall of assistantMessage.tool_calls) {
    console.error(`Executing tool: ${toolCall.function.name}`);
    console.error(`Tool arguments:`, toolCall.function.arguments);
    
    // Handle empty arguments for tools that don't require them
    let args = {};
    try {
      if (toolCall.function.arguments && toolCall.function.arguments.trim() !== '') {
        args = JSON.parse(toolCall.function.arguments);
      }
    } catch (parseError) {
      console.error(`Failed to parse tool arguments:`, parseError);
      // Continue with empty args
    }
    
    const result = await executeDiscordTool(toolCall.function.name, args);
    console.error(`Tool result preview:`, result.substring(0, 200) + '...');
    
    toolResults.push({
      tool_call_id: toolCall.id,
      role: 'tool',
      content: result,
    });
  }
  
  // Send tool results back to LLM
  const followUpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        ...messages,
        assistantMessage,
        ...toolResults,
      ],
      tools: discordTools, // Include tools in case model needs more
      max_tokens: 2500,
      temperature: 0.7,
    }),
  });
  
  const followUpData = await followUpResponse.json() as any;
  
  console.error(`===== FOLLOW-UP RESPONSE (Round ${depth + 1}) =====`);
  console.error('Has more tool_calls?', !!followUpData.choices[0].message.tool_calls);
  
  if (!followUpResponse.ok) {
    throw new Error(`LLM API error: ${followUpData.error?.message || 'Unknown error'}`);
  }
  
  // Recursively handle if there are more tool calls
  return executeToolsRecursively(
    [...messages, assistantMessage, ...toolResults],
    followUpData.choices[0].message,
    depth + 1
  );
}

// Enhanced LLM call with recursive tool support
async function callLLMWithTools(prompt: string, context?: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const messages = [
    {
      role: 'system',
      content: context || `You are AIMI, a helpful AI assistant in Discord. You have access to Discord tools to read messages, list servers, and send messages. Use these tools when users ask you to check channels, read messages, or interact with Discord. 
      IMPORTANT: Always use tool_calls to execute tools, never output JSON directly as text. If a tool fails, retry with corrected parameters using another tool_call.
      Provide comprehensive and detailed responses.`,
    },
    {
      role: 'user',
      content: prompt,
    },
  ];

  const requestBody = {
    model: LLM_MODEL,
    messages,
    tools: discordTools,
    tool_choice: 'auto',
    max_tokens: 2500,
    temperature: 0.7,
  };

  console.error('===== SENDING LLM REQUEST =====');
  console.error('Model:', LLM_MODEL);
  console.error('User prompt:', prompt);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json() as any;
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${data.error?.message || 'Unknown error'}`);
  }

  // Use recursive tool execution
  return executeToolsRecursively(messages, data.choices[0].message);
}

// Discord event handlers
client.once('ready', () => {
  console.error(`Discord bot logged in as ${client.user?.tag}`);
  console.error('Bot ID:', client.user?.id);
  console.error('Ready with recursive tool calling support!');
});

// Message handler for bot mentions and DMs
client.on('messageCreate', async (message: Message) => {
  console.error('Message received from:', message.author.tag, 'Content:', message.content.substring(0, 50));
  
  if (message.author.bot) {
    console.error('Ignoring bot message');
    return;
  }

  const botWasMentioned = message.mentions.has(client.user!.id);
  const isDM = message.channel.isDMBased();
  
  console.error('Bot mentioned:', botWasMentioned, 'Is DM:', isDM);

  if (!botWasMentioned && !isDM) return;

  // Show typing indicator
  if ('sendTyping' in message.channel) {
    await message.channel.sendTyping();
  }

  try {
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
    
    // Get conversation context
    const messages = await message.channel.messages.fetch({ limit: 5, before: message.id });
    const contextMessages = Array.from(messages.values())
      .reverse()
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    const response = await callLLMWithTools(
      cleanContent,
      `You are AIMI, an AI assistant in the "${message.guild?.name || 'DM'}" Discord server.
       You have access to tools to read Discord channels, list servers, and send messages.
       When users ask you to check, read, or summarize channels, use the read_messages tool.
       Provide comprehensive, detailed responses - don't worry about length.
       Recent conversation context:\n${contextMessages}`
    );

    // Handle long messages by splitting them
    const MAX_LENGTH = 1950;
    
    if (response.length <= MAX_LENGTH) {
      await message.reply(response);
    } else {
      // Split into multiple messages
      console.error(`Response too long (${response.length} chars), splitting...`);
      
      const parts = [];
      let remaining = response;
      
      while (remaining.length > 0) {
        if (remaining.length <= MAX_LENGTH) {
          parts.push(remaining);
          break;
        }
        
        let splitPoint = MAX_LENGTH;
        
        // Try to split at natural break points
        const paragraphBreak = remaining.lastIndexOf('\n\n', MAX_LENGTH);
        if (paragraphBreak > MAX_LENGTH * 0.5) {
          splitPoint = paragraphBreak;
        } else {
          const sentenceEnd = remaining.lastIndexOf('. ', MAX_LENGTH);
          if (sentenceEnd > MAX_LENGTH * 0.7) {
            splitPoint = sentenceEnd + 1;
          } else {
            const lineBreak = remaining.lastIndexOf('\n', MAX_LENGTH);
            if (lineBreak > MAX_LENGTH * 0.7) {
              splitPoint = lineBreak;
            }
          }
        }
        
        parts.push(remaining.substring(0, splitPoint).trim());
        remaining = remaining.substring(splitPoint).trim();
      }
      
      // Send all parts
      for (let i = 0; i < parts.length; i++) {
        const header = parts.length > 1 ? `**[Part ${i + 1}/${parts.length}]**\n\n` : '';
        await message.reply(header + parts[i]);
        
        if (i < parts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
    await message.reply('Sorry, I encountered an error. Please try again.');
  }
});

// ===== MCP Server Setup (for Claude Desktop) =====

const SendMessageSchema = z.object({
  server: z.string().optional(),
  channel: z.string(),
  message: z.string(),
});

const ReadMessagesSchema = z.object({
  server: z.string().optional(),
  channel: z.string(),
  limit: z.number().min(1).max(100).default(50),
});

// Create MCP server instance
const server = new Server(
  {
    name: "discord-with-recursive-tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-servers",
        description: "List all Discord servers the bot is connected to",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "send-message",
        description: "Send a message to a Discord channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description: 'Server name or ID (optional if bot is only in one server)',
            },
            channel: {
              type: "string",
              description: 'Channel name (e.g., "general") or ID',
            },
            message: {
              type: "string",
              description: "Message content to send",
            },
          },
          required: ["channel", "message"],
        },
      },
      {
        name: "read-messages",
        description: "Read recent messages from a Discord channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description: 'Server name or ID (optional if bot is only in one server)',
            },
            channel: {
              type: "string",
              description: 'Channel name (e.g., "general") or ID',
            },
            limit: {
              type: "number",
              description: "Number of messages to fetch (max 100)",
              default: 50,
            },
          },
          required: ["channel"],
        },
      },
    ],
  };
});

// Handle MCP tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await executeDiscordTool(
      name.replace('-', '_'),
      args
    );
    
    return {
      content: [{
        type: "text",
        text: result,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Main function
async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN environment variable is not set');
  }
  
  try {
    await client.login(token);
    console.error('Discord bot connected with recursive tool calling!');
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();