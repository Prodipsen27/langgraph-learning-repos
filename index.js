// --- STEP 1: GATHERING TOOLS ---
// These are like special tools in a toolbox that help our robot butler work!
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// These help our robot read secret keys and save pictures of its work.
import dotenv from "dotenv";
import fs from "node:fs";

// This tells the robot to look at its "secret notebook" (.env file) for passwords.
dotenv.config();

// --- STEP 2: THE ROBOT'S BRAIN (AI) ---
// This part sets up Alfred's brain so he can help us plan things.
const alfredBrain = new ChatOpenAI({
  configuration: {
    baseURL: "https://models.github.ai/inference", // Where the AI brain lives
  },
  apiKey: process.env.GITHUB_TOKEN, // Alfred's special key to use the brain
  modelName: "gpt-4o-mini", // The name of the smart brain we are using
});

// --- STEP 3: THE NOTEBOOK (STATE) ---
// This is Alfred's notebook where he writes down everything he learns about his tasks.
const AlfredNotebook = Annotation.Root({
  // What we are talking about today (like "Dinosaurs" or "Pizza")
  topic: Annotation({
    reducer: (x, y) => y ?? x, // Always keep the newest topic
  }),

  // Alfred's first idea for a fun fact or joke
  initialIdea: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // The final, super-cool fact or joke Alfred finished
  finalResult: Annotation({
    reducer: (x, y) => y ?? x,
  }),
});

// --- STEP 4: ALFRED'S CHORES (NODES) ---

// Chore 1: Think of a basic idea!
const brainstormNode = async (state) => {
  console.log("🤖 Alfred is brainstorming an idea...");
  
  // Alfred writes down a basic idea based on the topic
  return { initialIdea: `A fun fact about ${state.topic}` };
};

// Chore 2: Make the idea better!
const polishNode = async (state) => {
  console.log("✨ Alfred is polishing the idea to make it perfect...");

  // Alfred turns the idea into a proper "Final Result"
  return {
    finalResult: `Did you know? ${state.topic} is actually very amazing! (Alfred polished this for you).`,
  };
};

// Chore 3: Double check everything!
const checkNode = async (state) => {
  console.log("🧐 Alfred is double-checking his work...");
  return {
    finalResult: state.finalResult,
  };
};

// --- STEP 5: MAKING DECISIONS ---
// This is like Alfred standing at a fork in the road.
const decideNextStep = (state) => {
  // Sometimes Alfred wants to be extra careful! 
  // We use a random number to decide if he should polish again or finish.
  if (Math.random() < 0.5) {
    console.log("🔄 Alfred thinks he can make it even better! Looping back...");
    return "polish"; 
  }
  console.log("✅ Alfred is happy with the result! Moving to final check.");
  return "finish";
};

// --- STEP 6: DRAWING THE MAP (THE GRAPH) ---
// This is where we tell Alfred exactly what order to do his chores in!
const workflow = new StateGraph(AlfredNotebook)
  .addNode("brainstorm", brainstormNode) // Step 1
  .addNode("polish", polishNode)           // Step 2
  .addNode("check", checkNode)             // Step 3

  // Define the path:
  .addEdge(START, "brainstorm")            // 1. Start here
  
  // 2. After brainstorming, Alfred decides what to do next
  .addConditionalEdges("brainstorm", decideNextStep, {
    "polish": "polish",
    "finish": "check"
  })

  // 3. If he went to polish, he finishes after that
  .addEdge("polish", END)
  
  // 4. If he went to check, he finishes after that
  .addEdge("check", END);

// This "compiles" the map so the robot can actually follow it!
const alfredSystem = workflow.compile();

// --- STEP 7: MAIN FUNCTION ---
// This runs everything!
async function main() {
  console.log("🛠️ Alfred is drawing a map of his workflow...");

  try {
    /*
      This part creates a visual diagram of the workflow
      and saves it as graph.png so we can see it!
    */
    const drawableGraph = await alfredSystem.getGraphAsync();
    const png = await drawableGraph.drawMermaidPng();
    const arrayBuffer = await png.arrayBuffer();

    // Save image file
    fs.writeFileSync("graph.png", Buffer.from(arrayBuffer));
    console.log("✅ Map saved as graph.png!");
  } catch (error) {
    console.error("❌ Oops, Alfred couldn't draw the map:", error.message);
  }

  // --- RUNNING THE WORKFLOW ---
  console.log("\n🚀 Alfred is starting his chores...");

  // We give Alfred a topic to start with
  const result = await alfredSystem.invoke({
    topic: "Space Travel",
  });

  // --- SHOWING THE RESULTS ---
  console.log("\n" + "=".repeat(30));
  console.log("📋 ALFRED'S REPORT");
  console.log("=".repeat(30));
  console.log(`Topic: ${result.topic}`);
  console.log(`Initial Idea: ${result.initialIdea}`);
  console.log(`Final Result: ${result.finalResult}`);
  console.log("=".repeat(30) + "\n");
}

// Start the program!
main().catch(console.error);