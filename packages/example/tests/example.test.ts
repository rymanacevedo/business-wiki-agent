import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTitle } from "../index";

test("formats a title through the public interface", () => {
  assert.equal(formatTitle("  hELLo\t WORLD  "), "Hello World");
  assert.equal(formatTitle(" \n "), "");
});
