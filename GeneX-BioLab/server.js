"use strict";

require("dotenv").config();
var http = require("http");

var port = Number(process.env.PORT || 8787);
var requestWindowMs = 60 * 1000;
var maxRequestsPerWindow = 20;
var requestLog = new Map();
var tutorPrompt = "You are GeneX BioLab's professional biology tutor. Give accurate, polished answers for curious beginners. For broad questions, provide a genuinely thorough explanation of about 250-450 words, covering definition, structure or mechanism, importance, and a concrete example. Use a short helpful heading when useful, then clear paragraphs. Use bullet points for comparisons or steps. Define technical terms briefly, include a simple analogy when it improves understanding, and end with one concise takeaway. Adjust length only when the learner explicitly asks for a short answer. Do not use emojis, tables, or excessive formatting.";
var modePrompts = {
  simple: "Use very plain language and one everyday analogy. Avoid unnecessary jargon.",
  exam: "Focus on exam-ready definitions, mechanisms, common misconceptions, and one short practice question.",
  quiz: "Teach through a short question first. Give one question at a time and wait for the learner's answer before revealing the explanation.",
  flashcards: "Format the response as 3-5 concise flashcards. Each card must have a 'Front:' line and a 'Back:' line.",
};

function getTutorPrompt(mode, context) {
  var prompt = tutorPrompt + "\n\nCurrent mode: " + (modePrompts[mode] || "Answer as a supportive tutor.");
  return context ? prompt + "\n\nLesson context:\n" + String(context).slice(0, 2000) : prompt;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(body));
}

function callProvider(provider, messages, mode, context) {
  var url;
  var headers;
  var body;
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) return Promise.reject(new Error("Set GEMINI_API_KEY in .env to use Gemini."));
    var model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(process.env.GEMINI_API_KEY);
    headers = {};
    body = {
      systemInstruction: { parts: [{ text: getTutorPrompt(mode, context) }] },
      contents: messages.map(function (message) {
        return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] };
      }),
      generationConfig: { maxOutputTokens: 2000 },
    };
  } else if (provider === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) return Promise.reject(new Error("Set ANTHROPIC_API_KEY in .env to use Claude."));
    url = "https://api.anthropic.com/v1/messages";
    headers = { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" };
    body = { model: process.env.CLAUDE_MODEL || "claude-3-5-haiku-latest", max_tokens: 700, system: getTutorPrompt(mode, context), messages: messages };
  } else {
    if (!process.env.OPENAI_API_KEY) return Promise.reject(new Error("Set OPENAI_API_KEY in .env to use OpenAI."));
    url = "https://api.openai.com/v1/chat/completions";
    headers = { Authorization: "Bearer " + process.env.OPENAI_API_KEY };
    body = { model: process.env.OPENAI_MODEL || "gpt-4o-mini", max_tokens: 700, messages: [{ role: "system", content: getTutorPrompt(mode, context) }].concat(messages) };
  }
  return fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body) })
    .then(function (result) {
      return result.json().then(function (data) {
        if (!result.ok) throw new Error(data.error && (data.error.message || data.error) || "Provider request failed.");
        if (provider === "gemini") return data.candidates[0].content.parts[0].text;
        return provider === "claude" ? data.content[0].text : data.choices[0].message.content;
      });
    });
}

function streamGemini(response, messages, mode, context) {
  if (!process.env.GEMINI_API_KEY) return json(response, 502, { error: "Set GEMINI_API_KEY in .env to use Gemini." });
  var model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(process.env.GEMINI_API_KEY);
  var body = {
    systemInstruction: { parts: [{ text: getTutorPrompt(mode, context) }] },
    contents: messages.map(function (message) {
      return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] };
    }),
    generationConfig: { maxOutputTokens: 2000 },
  };
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (result) {
    if (!result.ok) return result.json().then(function (data) { throw new Error(data.error && (data.error.message || data.error) || "Provider request failed."); });
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" });
    var reader = result.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    function emitLine(line) {
      if (!line.startsWith("data: ")) return;
      try {
        var data = JSON.parse(line.slice(6));
        var text = data.candidates && data.candidates[0].content.parts[0].text;
        if (text) response.write("data: " + JSON.stringify({ text: text }) + "\n\n");
      } catch (error) { /* ignore incomplete provider chunks */ }
    }
    function readChunk() {
      return reader.read().then(function (part) {
        buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        var lines = buffer.split("\n");
        buffer = lines.pop();
        lines.forEach(emitLine);
        if (part.done) {
          if (buffer.trim()) emitLine(buffer);
          response.write("data: [DONE]\n\n");
          response.end();
          return;
        }
        return readChunk();
      });
    }
    return readChunk();
  }).catch(function (error) {
    if (!response.headersSent) return json(response, 502, { error: error.message });
    response.write("data: " + JSON.stringify({ error: error.message }) + "\n\n");
    response.end();
  });
}

http.createServer(function (request, response) {
  if (request.method === "OPTIONS") return json(response, 204, {});
  var isStream = request.url === "/api/chat/stream";
  if (request.method !== "POST" || (request.url !== "/api/chat" && !isStream)) return json(response, 404, { error: "Not found" });
  var clientAddress = request.socket.remoteAddress || "unknown";
  var now = Date.now();
  var recentRequests = (requestLog.get(clientAddress) || []).filter(function (timestamp) { return now - timestamp < requestWindowMs; });
  if (recentRequests.length >= maxRequestsPerWindow) return json(response, 429, { error: "Too many requests. Please wait a minute and try again." });
  recentRequests.push(now);
  requestLog.set(clientAddress, recentRequests);
  var chunks = [];
  var bodySize = 0;
  var tooLarge = false;
  request.on("data", function (chunk) { chunks.push(chunk); });
  request.on("data", function (chunk) {
    bodySize += chunk.length;
    if (bodySize > 32000) tooLarge = true;
  });
  request.on("end", function () {
    if (tooLarge) return json(response, 413, { error: "That request is too large." });
    try {
      var input = JSON.parse(Buffer.concat(chunks).toString());
      var messages = Array.isArray(input.history) ? input.history.slice(-12) : [];
      messages.push({ role: "user", content: String(input.message || "").slice(0, 4000) });
      if (!messages[messages.length - 1].content.trim()) return json(response, 400, { error: "Message cannot be empty." });
      var provider = input.provider === "gemini" || input.provider === "claude" ? input.provider : "openai";
      if (isStream && provider !== "gemini") return json(response, 400, { error: "Streaming is currently available with Gemini." });
      if (isStream) return streamGemini(response, messages, input.mode, input.context);
      callProvider(provider, messages, input.mode, input.context)
        .then(function (reply) { json(response, 200, { reply: reply }); })
        .catch(function (error) { json(response, 502, { error: error.message }); });
    } catch (error) {
      json(response, 400, { error: "Invalid request." });
    }
  });
}).listen(port, function () {
  console.log("GeneX AI server listening on http://localhost:" + port);
});
