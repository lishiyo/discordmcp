// ABOUTME: Discord bot with LLM integration for responding to messages
// ABOUTME: Handles mentions and DMs, processes with OpenRouter/OpenAI API

import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

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

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Or use OpenAI directly
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

async function callLLM(prompt: string, context?: string): Promise<string> {
  // Using OpenRouter (supports many models)
  if (OPENROUTER_API_KEY) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-site.com', // Optional but recommended
        'X-Title': 'Discord Bot', // Optional
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet', // or 'openai/gpt-4', 'meta-llama/llama-3.1-70b-instruct', etc.
        messages: [
          {
            role: 'system',
            content: context || 'You are a helpful Discord assistant. Be concise and friendly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  // Using OpenAI directly
  if (OPENAI_API_KEY) {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview', // or 'gpt-3.5-turbo'
        messages: [
          {
            role: 'system',
            content: context || 'You are a helpful Discord assistant. Be concise and friendly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  throw new Error('No LLM API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env');
}

// Handle incoming messages
client.on('messageCreate', async (message: Message) => {
  // Ignore messages from bots (including itself)
  if (message.author.bot) return;

  // Check if bot was mentioned or if it's a DM
  const botWasMentioned = message.mentions.has(client.user!.id);
  const isDM = message.channel.isDMBased();

  if (!botWasMentioned && !isDM) return;

  // Show typing indicator (check if channel supports it)
  if ('sendTyping' in message.channel) {
    await message.channel.sendTyping();
  }

  try {
    // Remove the mention from the message if present
    const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
    
    // Get conversation context (last 10 messages)
    const messages = await message.channel.messages.fetch({ limit: 10, before: message.id });
    const context = Array.from(messages.values())
      .reverse()
      .map(m => `${m.author.username}: ${m.content}`)
      .join('\n');

    // Call LLM with the message
    const response = await callLLM(
      cleanContent,
      `You are a helpful AI assistant in the Discord server "${message.guild?.name || 'DM'}". 
       Here's recent conversation context:\n${context}\n
       Respond naturally and helpfully to the user's message.`
    );

    // Handle long messages by splitting them
    const MAX_LENGTH = 1950; // Leave buffer for Discord's limit
    
    if (response.length <= MAX_LENGTH) {
      // Single message
      await message.reply(response);
    } else {
      // Split into multiple messages
      console.log(`Response too long (${response.length} chars), splitting into parts...`);
      
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
    console.error('Error processing message:', error);
    await message.reply('Sorry, I encountered an error while processing your request.');
  }
});

client.once('ready', () => {
  console.log(`Bot is online as ${client.user?.tag}!`);
  console.log('Bot will respond to:');
  console.log('- Direct mentions (@bot)');
  console.log('- Direct messages');
});

// Login
client.login(process.env.DISCORD_TOKEN);