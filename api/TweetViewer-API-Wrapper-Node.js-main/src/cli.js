#!/usr/bin/env node
import { TweetViewerClient, TweetViewerError } from "./client.js";

const [command, value, ...flags] = process.argv.slice(2);
const client = new TweetViewerClient();

function usage() {
  console.error(`Usage:
  tweetviewer profile <handle-or-url>
  tweetviewer timeline <handle-or-url> [--cursor <cursor>]
  tweetviewer latest <handle-or-url> [--exclude-replies] [--exclude-retweets]
  tweetviewer tweet <id-or-url>
  tweetviewer resolve <id-or-url> [--lang <language>]
  tweetviewer view <query>`);
}

function flag(name) {
  const index = flags.indexOf(name);
  return index >= 0 ? flags[index + 1] : undefined;
}

try {
  let result;
  if (command === "profile" && value) result = await client.getProfile(value);
  else if (command === "timeline" && value) result = await client.getTimeline(value, { cursor: flag("--cursor") });
  else if (command === "latest" && value) {
    result = await client.getLatestTweet(value, {
      includeReplies: !flags.includes("--exclude-replies"),
      includeRetweets: !flags.includes("--exclude-retweets"),
    });
  }
  else if (command === "tweet" && value) result = await client.getTweet(value);
  else if (command === "resolve" && value) result = await client.resolveMedia(value, { language: flag("--lang") });
  else if (command === "view" && value) result = await client.view([value, ...flags].join(" "));
  else {
    usage();
    process.exitCode = 1;
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof TweetViewerError) {
    console.error(JSON.stringify({ ok: false, status: error.status, code: error.code, error: error.message }, null, 2));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
