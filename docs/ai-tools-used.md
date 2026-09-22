# AI tools used during development

| Tool | Used for |
| --- | --- |
| Claude (Anthropic) via Claude Code | Requirements analysis, planning document, scaffolding, writing most of the application code, tests, and this documentation, working from the brief under human direction |
| Cerebras (gpt-oss-120b, qwen-3.8-27b), Google Gemini | Runtime models inside the product, for intent classification and grounded answering. Cerebras is primary, Gemini a fallback. Not used to write code |

How the work was directed: the brief was decomposed line by line into a requirements and plan document first. The backend was built against a mocked model and a full test suite before any real model call was wired in. Every generated file was run through the type checker, linter, unit tests, and a browser end-to-end test; failures were fixed iteratively. Product and engineering decisions in `decisions.md` were made by the author and are defensible independent of the tooling.
