// --- STEP 1: GATHERING TOOLS ---
// These are like special gadgets in a utility belt that help our robot butler, Alfred!
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// These help Alfred read secret keys and save pictures of his work.
import dotenv from "dotenv";
import fs from "node:fs";

// Load Alfred's secret settings (like his AI API key)
dotenv.config();

// --- STEP 2: THE ROBOT'S BRAINS ---

// Alfred's main brain for thinking and talking
const alfredBrain = new ChatOpenAI({
  configuration: {
    baseURL: "https://models.github.ai/inference", // Where the AI brain lives
  },
  apiKey: process.env.GITHUB_TOKEN,
  modelName: "gpt-4o-mini",
});

// Alfred's special "Vision Eye" for looking at pictures
const visionBrain = new ChatOpenAI({
  configuration: {
    baseURL: "https://models.github.ai/inference",
  },
  apiKey: process.env.GITHUB_TOKEN,
  modelName: "gpt-4o-mini",
});

// --- STEP 3: THE NOTEBOOK (STATE) ---
// This is Alfred's notebook where he writes down everything he learns about a file or a question.
const AlfredNotebook = Annotation.Root({
  inputFile: Annotation({
    reducer: (x, y) => y ?? x, // Store the path to the picture or document
  }),
  messages: Annotation({
    reducer: (x, y) => x.concat(y), // Keep a list of the whole conversation
    default: () => [],
  }),
});

// --- STEP 4: ALFRED'S SPECIAL ABILITIES (TOOLS) ---

// Ability 1: Math! Alfred can divide big numbers.
const divideTool = tool(
  async ({ a, b }) => {
    console.log(`🤖 Alfred is calculating: ${a} divided by ${b}`);
    return (a / b).toString();
  },
  {
    name: "divide",
    description: "Use this to divide two numbers.",
    schema: z.object({
      a: z.number().describe("The first number"),
      b: z.number().describe("The second number"),
    }),
  }
);

// Ability 2: Reading! Alfred can read text from a picture.
const readPictureTool = tool(
  async ({ imgPath }) => {
    console.log(`🤖 Alfred is looking at the document: ${imgPath}`);
    try {
      // Alfred reads the picture and turns it into text
      const imageBase64 = fs.readFileSync(imgPath).toString("base64");
      const message = new HumanMessage({
        content: [
          { 
            type: "text", 
            text: "Extract all the text from this image. Return only the extracted text, no explanations." 
          },
          { 
            type: "image_url", 
            image_url: { url: `data:image/png;base64,${imageBase64}` } 
          },
        ],
      });
      const response = await visionBrain.invoke([message]);
      return response.content;
    } catch (e) {
      return `I'm sorry, I couldn't read the file: ${e.message}`;
    }
  },
  {
    name: "extractText",
    description: "Use this to read text from an image file.",
    schema: z.object({
      imgPath: z.string().describe("The path to the image file"),
    }),
  }
);

// List of tools Alfred can use
const toolsList = [divideTool, readPictureTool];

// Connect Alfred's brain to his tools
const alfredWithTools = alfredBrain.bindTools(toolsList);

// --- STEP 5: ALFRED'S JOBS (NODES) ---

// Job 1: Think about the request!
const alfredAssistant = async (state) => {
  // Alfred reminds himself who he is
  const systemPrompt = new SystemMessage(
    "You are Alfred, the loyal butler to Mr. Wayne (Batman). " +
    "You help him with math and reading documents. " +
    "Be polite and professional."
  );
  
  // Alfred looks at his notebook and the current loaded image
  const imageInfo = state.inputFile ? `The currently loaded image is: ${state.inputFile}` : "No image is loaded.";
  const contextMessage = new SystemMessage(imageInfo);

  // Alfred talks to his brain
  const response = await alfredWithTools.invoke([
    systemPrompt,
    contextMessage,
    ...state.messages
  ]);

  return { 
    messages: [response],
    inputFile: state.inputFile 
  };
};

// Job 2: Use the tools! (This is a built-in LangGraph job)
const toolNode = new ToolNode(toolsList);

// --- STEP 6: DRAWING THE MAP (THE GRAPH) ---
const agentGraph = new StateGraph(AlfredNotebook)
  .addNode("alfred", alfredAssistant) // Alfred's thinking step
  .addNode("tools", toolNode)         // Alfred's tool-using step

  .addEdge(START, "alfred")           // Always start by thinking

  // If Alfred thinks he needs a tool, go to "tools". Otherwise, stop.
  .addConditionalEdges("alfred", toolsCondition)

  // After using a tool, Alfred thinks again to give the final answer
  .addEdge("tools", "alfred");

// Compile the graph into a runnable system
const alfredSystem = agentGraph.compile();

// --- STEP 7: TESTING ALFRED ---

// A helper function to print Alfred's conversation nicely
const printConversation = (messages) => {
  messages.forEach(m => {
    const type = m._getType();
    if (type === "human") console.log(`\nHuman: ${m.content}`);
    if (type === "ai") {
      if (m.content) console.log(`\nAlfred: ${m.content}`);
      if (m.tool_calls?.length > 0) {
        m.tool_calls.forEach(tc => console.log(`\n[Alfred is using his ${tc.name} tool...]`));
      }
    }
    if (type === "tool") console.log(`\n(Tool Response): ${m.content}`);
  });
};

async function runTests() {
  // TEST 1: Math
  console.log("\n--- TEST 1: MATH ---");
  const mathResult = await alfredSystem.invoke({
    messages: [new HumanMessage("Alfred, what is 6790 divided by 5?")],
    inputFile: null,
  });
  printConversation(mathResult.messages);

  // TEST 2: Vision
  console.log("\n--- TEST 2: VISION ---");
  const visionResult = await alfredSystem.invoke({
    messages: [new HumanMessage("Alfred, look at the note in the picture and tell me what items I should buy for dinner.")],
    inputFile: "Batman_training_and_meals.png",
  });
  printConversation(visionResult.messages);
}

// Start the tests!
runTests().catch(console.error);

// --- EXTRA: DRAWING THE MAP ---
try {
  const drawableGraph = await alfredSystem.getGraphAsync();
  const png = await drawableGraph.drawMermaidPng();
  fs.writeFileSync("agentGraph.png", Buffer.from(await png.arrayBuffer()));
  console.log("\n✅ Map saved as agentGraph.png");
} catch (e) {
  console.log("\n❌ Couldn't draw map: " + e.message);
}
