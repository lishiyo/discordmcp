// ABOUTME: Unified MCP Discord server with LLM bot that can use Discord tools
// ABOUTME: Combines MCP server (stdio) with Discord bot that has tool-calling capabilities

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

// Execute Discord tools - reuses existing logic
async function executeDiscordTool(toolName: string, args: any): Promise<string> {
  try {
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
        const { channel: channelIdentifier, limit = 50, server } = args;
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
        const { channel: channelIdentifier, message, server } = args;
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

// Enhanced LLM call with tool support
async function callLLMWithTools(prompt: string, context?: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const messages = [
    {
      role: 'system',
      content: context || `You are AIMI, a helpful AI assistant in Discord. You have access to Discord tools to read messages, list servers, and send messages. Use these tools when users ask you to check channels, read messages, or interact with Discord.`,
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
    tool_choice: 'auto', // Let the model decide when to use tools
    max_tokens: 2500,
    temperature: 0.7,
  };

  console.error('===== SENDING LLM REQUEST =====');
  console.error('Model:', LLM_MODEL);
  console.error('User prompt:', prompt);
  console.error('Tools provided:', discordTools.map(t => t.function.name).join(', '));

  // Make initial request with tools
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json() as any;
  
  console.error('===== LLM RESPONSE =====');
  console.error('Response status:', response.status);
  console.error('Response data:', JSON.stringify(data, null, 2));
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${data.error?.message || 'Unknown error'}`);
  }

  const assistantMessage = data.choices[0].message;

  console.error('===== ASSISTANT MESSAGE =====');
  console.error('Has tool_calls?', !!assistantMessage.tool_calls);
  console.error('Assistant message:', JSON.stringify(assistantMessage, null, 2));

  // Check if the model wants to use tools
  if (assistantMessage.tool_calls) {
    console.error('===== EXECUTING TOOLS =====');
    // Execute all tool calls
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
        console.error(`Raw arguments:`, toolCall.function.arguments);
        // Continue with empty args
      }
      
      const result = await executeDiscordTool(toolCall.function.name, args);
      
      console.error(`Tool result:`, result.substring(0, 200) + '...');
      
      toolResults.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: result,
      });
    }

    // Send tool results back to LLM for final response
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
          assistantMessage, // Include the assistant's tool call message
          ...toolResults,   // Include tool results
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    const followUpData = await followUpResponse.json() as any;
    
    console.error('===== FOLLOW-UP RESPONSE =====');
    console.error('Follow-up response:', JSON.stringify(followUpData.choices[0].message, null, 2));
    
    if (!followUpResponse.ok) {
      throw new Error(`LLM API error: ${followUpData.error?.message || 'Unknown error'}`);
    }

    // Handle different response formats - some models put content in reasoning field
    const followUpMessage = followUpData.choices[0].message;
    let finalContent = followUpMessage.content;
    
    // Clean up GPT-OSS reasoning artifacts
    if (finalContent) {
      // Remove internal thinking patterns
      finalContent = finalContent.replace(/^(analysis|assistant|commentary|final).*?(?=\*\*|[A-Z])/gs, '');
      finalContent = finalContent.trim();
    }
    
    // If content is empty, check for reasoning field (GPT-OSS models)
    if (!finalContent || finalContent.trim() === '') {
      if (followUpMessage.reasoning) {
        console.error('Using reasoning field as content');
        finalContent = followUpMessage.reasoning;
      } else {
        // Fallback if both are empty
        console.error('Both content and reasoning are empty, using fallback');
        finalContent = 'I processed your request and retrieved the information from the channel.';
      }
    }
    
    return finalContent;
  }

  // No tools needed, return direct response
  let directContent = assistantMessage.content;
  
  // Clean up any reasoning artifacts
  if (directContent) {
    directContent = directContent.replace(/^(analysis|assistant|commentary|final).*?(?=\*\*|[A-Z])/gs, '');
    directContent = directContent.trim();
  }
  
  // Check if content is empty and use reasoning if available
  if (!directContent || directContent === '') {
    if (assistantMessage.reasoning) {
      console.error('Direct response: Using reasoning field as content');
      return assistantMessage.reasoning;
    }
    return 'I understand your request. Please let me know if you need any specific information.';
  }
  return directContent;
}

// Discord event handlers
client.once('ready', () => {
  console.error(`Discord bot logged in as ${client.user?.tag}`);
  console.error('Bot ID:', client.user?.id);
  console.error('Ready to respond to DMs and mentions with tool capabilities!');
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
       Recent conversation context:\n${contextMessages}`
    );

    // Handle long messages by splitting them
    const MAX_LENGTH = 1950; // Leave buffer for Discord's limit
    
    if (response.length <= MAX_LENGTH) {
      // Single message
      await message.reply(response);
    } else {
      // Split into multiple messages
      console.error(`Response too long (${response.length} chars), splitting into parts...`);
      
      const parts = [];
      let remaining = response;
      
      while (remaining.length > 0) {
        if (remaining.length <= MAX_LENGTH) {
          parts.push(remaining);
          break;
        }
        
        // Try to split at a natural break point
        let splitPoint = MAX_LENGTH;
        
        // Look for paragraph break
        const paragraphBreak = remaining.lastIndexOf('\n\n', MAX_LENGTH);
        if (paragraphBreak > MAX_LENGTH * 0.5) { // Only if it's not too far back
          splitPoint = paragraphBreak;
        } else {
          // Look for sentence end
          const sentenceEnd = remaining.lastIndexOf('. ', MAX_LENGTH);
          if (sentenceEnd > MAX_LENGTH * 0.7) {
            splitPoint = sentenceEnd + 1; // Include the period
          } else {
            // Look for any line break
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
        
        // Small delay between messages to avoid rate limiting
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

// Validation schemas
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
    name: "discord-with-tools",
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
    // Reuse the same tool executor
    const result = await executeDiscordTool(
      name.replace('-', '_'), // Convert MCP name format to function format
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

// Main function to start everything
async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN environment variable is not set');
  }
  
  try {
    // Login to Discord
    await client.login(token);
    console.error('Discord bot connected with tool-calling capabilities!');
    
    // Start MCP server for Claude Desktop
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio - available to Claude Desktop");
    console.error("Discord bot ready - responds to DMs and @mentions with tool access");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();