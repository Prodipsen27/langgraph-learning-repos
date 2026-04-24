// --- STEP 1: GATHERING TOOLS ---
// These are like special tools in a toolbox that help our robot butler, Alfred!
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

// These help our robot read secret keys and save pictures of its work.
import dotenv from "dotenv";
import fs from "node:fs";

// Load Alfred's secret notebook (.env file) for passwords.
dotenv.config();

// --- STEP 2: THE ROBOT'S BRAIN (AI) ---
// This part sets up Alfred's brain so he can read and understand emails.
const alfredBrain = new ChatOpenAI({
  configuration: {
    baseURL: "https://models.github.ai/inference", // Where the AI brain lives
  },
  apiKey: process.env.GITHUB_TOKEN, // Alfred's special key to use the brain
  modelName: "gpt-4o-mini", // The name of the smart brain we are using
});

// --- STEP 3: THE NOTEBOOK (STATE) ---
// This is Alfred's notebook where he writes down everything he learns about an email.
const AlfredNotebook = Annotation.Root({
  email: Annotation({
    reducer: (x, y) => y ?? x, // Save the newest email info
  }),
  emailCategory: Annotation({
    reducer: (x, y) => y ?? x, // Write down what kind of email it is (e.g. inquiry, thank you)
  }),
  spamReason: Annotation({
    reducer: (x, y) => y ?? x, // If it's spam, why?
  }),
  isSpam: Annotation({
    reducer: (x, y) => y ?? x, // Yes/No check: Is this email spam?
  }),
  emailDraft: Annotation({
    reducer: (x, y) => y ?? x, // Practice letter Alfred writes for his boss
  }),
  messages: Annotation({
    reducer: (x, y) => x.concat(y), // Keep a list of the conversation
    default: () => [],
  }),
});

// --- STEP 4: ALFRED'S JOBS (NODES) ---

// Job 1: Read the email!
const readEmailJob = async (state) => {
  const email = state.email;
  console.log(`🤖 Alfred is reading an email from ${email.sender}...`);
  return { }; 
};

// Job 2: Check if it's a "bad" email (Spam)!
const classifyEmailJob = async (state) => {
  console.log("🤖 Alfred is asking his brain if this is a real message or junk...");
  
  const email = state.email;
  const prompt = `
    As Alfred the butler, analyze this email and determine if it is spam or legitimate.
    
    Email:
    From: ${email.sender}
    Subject: ${email.subject}
    Body: ${email.body}
    
    Return your response in JSON format with the following keys:
    "isSpam": boolean,
    "spamReason": string (if spam),
    "emailCategory": string (if legitimate: inquiry, complaint, thank you, request, information, other)
  `;
  
  const response = await alfredBrain.invoke([new HumanMessage(prompt)]);
  
  // Clean up the response from the brain
  const content = response.content.replace(/```json\n?|\n?```/g, "").trim();
  const responseJson = JSON.parse(content);

  return { 
    isSpam: responseJson.isSpam, 
    spamReason: responseJson.spamReason || "", 
    emailCategory: responseJson.emailCategory || "", 
    messages: [{ role: "user", content: prompt }, { role: "assistant", content: response.content }] 
  };
};

// Job 3: Throw away the trash!
const handleSpamJob = async (state) => {
  console.log(`🗑️ Alfred has marked the email as SPAM. Reason: ${state.spamReason}`);
  console.log("The email has been moved to the trash folder.");
  return {};
};

// Job 4: Write a nice reply!
const draftResponseJob = async (state) => {
    console.log("📝 Alfred is writing a polite practice letter for his boss...");
    const email = state.email;
    const prompt = `
    As Alfred the butler, draft a polite response to this email.
    
    Email:
    From: ${email.sender}
    Subject: ${email.subject}
    Body: ${email.body}
    
    Category: ${state.emailCategory || "general"}
    
    Draft a professional response for Mr. Hugg to review.
  `;
    
    const response = await alfredBrain.invoke([new HumanMessage(prompt)]);
    
    return {
        emailDraft: response.content,
        messages: [{ role: "user", content: prompt }, { role: "assistant", content: response.content }]
    };
};

// Job 5: Show the letter to the boss!
const notifyBossJob = async (state) => {
    console.log("\n" + "=".repeat(50));
    console.log(`Sir, I've prepared a draft response to ${state.email.sender}:`);
    console.log("-".repeat(50));
    console.log(state.emailDraft);
    console.log("=".repeat(50) + "\n");
    return {};
};

// --- STEP 5: MAKING DECISIONS ---
const decideBranch = (state) => {
    return state.isSpam ? "spam" : "legitimate";
};

// --- STEP 6: DRAWING THE MAP (THE GRAPH) ---
const mailGraph = new StateGraph(AlfredNotebook)
  .addNode("read", readEmailJob)
  .addNode("classify", classifyEmailJob)
  .addNode("trash", handleSpamJob)
  .addNode("draft", draftResponseJob)
  .addNode("notify", notifyBossJob)

  .addEdge(START, "read")
  .addEdge("read", "classify")
  .addConditionalEdges("classify", decideBranch, {
    "spam": "trash",
    "legitimate": "draft"
  })
  .addEdge("trash", END)
  .addEdge("draft", "notify")
  .addEdge("notify", END);

// Compile the map
const alfredSystem = mailGraph.compile();

// --- STEP 7: TESTING IT OUT ---

async function runExamples() {
    const legitimateEmail = {
        sender: "john.smith@example.com",
        subject: "Consulting Question",
        body: "Hello Mr. Hugg, I'd like to talk about your services. Can we meet next week?"
    };

    const spamEmail = {
        sender: "winner@free-money.com",
        subject: "YOU WON!",
        body: "You won $1,000,000! Just send us $100 to get it!"
    };

    console.log("\n--- Example 1: Legitimate Email ---");
    await alfredSystem.invoke({ email: legitimateEmail });

    console.log("\n--- Example 2: Spam Email ---");
    await alfredSystem.invoke({ email: spamEmail });
}

runExamples().catch(console.error);

// --- EXTRA: DRAWING THE MAP ---
try {
  const drawableGraph = await alfredSystem.getGraphAsync();
  const png = await drawableGraph.drawMermaidPng();
  fs.writeFileSync("mailGraph.png", Buffer.from(await png.arrayBuffer()));
  console.log("✅ Map saved as mailGraph.png");
} catch (e) {
  console.log("❌ Could not draw map: " + e.message);
}
