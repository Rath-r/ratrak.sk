import { initRatrak } from "./ratrak.js";
import { ratrakQuotes } from "../content/ratrak-quotes.js";
import { ratrakSprites } from "../content/ratrak-sprites.js";

initRatrak({
  quotes: ratrakQuotes,
  sprites: ratrakSprites,
});

console.log("[ratrak] init ok");
