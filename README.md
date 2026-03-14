# ☕ wasm2lang


<div align="center">

### Transform WebAssembly into practical target-language output 🚀

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)
[![GitHub stars](https://img.shields.io/github/stars/COFFEETALES/wasm2lang?style=for-the-badge)](../../stargazers)

</div>

> 💖 If `wasm2lang` is useful in your workflow, please consider sponsoring the project on GitHub. Sponsorship directly supports refactoring, backend quality, validation, and long-term sustainability.

---

## ✨ What is `wasm2lang`?

`wasm2lang` is a command-line tool that transforms **WebAssembly** inputs into other target-language outputs through a controlled and maintainable pipeline.

It currently focuses on:

- ⚙️ reliable code generation workflows
- 🧩 backend emission for **asm.js** and **PHP**
- 🧭 predictable normalization and traversal behavior
- ✅ validation through project-specific build and test commands
- 🔧 ongoing refactoring to make backend support easier to maintain and extend

This project is designed for people who want to work directly with the transformation process, inspect emitted output, and evolve backend support in a disciplined way.

---

## 🌟 Why this project exists

Working with WebAssembly is powerful, but backend-oriented transformation workflows can get messy fast.

`wasm2lang` aims to make that process more:

- **predictable**
- **inspectable**
- **maintainable**
- **practical for real code generation**

The current priority is **useful output generation** and a **cleaner internal architecture**, rather than broad feature coverage.

---

## 👥 Who is this for?

`wasm2lang` may be useful for:

- 🛠️ developers experimenting with WebAssembly transformation pipelines
- 🔍 people who want to inspect generated output closely
- 🧪 contributors interested in compiler/codegen backend work
- 🏗️ maintainers who value explicit validation and predictable internal passes
- 📚 researchers or hobbyists exploring cross-language backend emission

---

## 🎯 Current scope

At the moment, `wasm2lang` is focused on:

- processing WebAssembly inputs through a controlled transformation pipeline
- emitting target code for:
  - **asm.js**
  - **PHP**
- supporting development and debugging with stable traversal and codegen flows
- validating changes with repository-specific checks and generated test artifacts

---

## 🛠️ How it works

A typical `wasm2lang` workflow looks like this:

1. 📥 read a WebAssembly input
2. 🧹 normalize it through configured passes
3. 🌲 traverse the internal representation
4. 🏗️ emit code for a selected backend
5. ✅ validate the result with build and runtime checks

This keeps the workflow practical for both day-to-day usage and backend experimentation.

---

## 🚀 Usage

Example CLI command:

```bash
node wasmxlang.js                                 \
  --dev                                           \
  --input-file sample.wast                        \
  --normalize-wasm binaryen:min,wasm2lang:codegen \
  --emit-code
```

The exact available flags and workflows may evolve as the refactor continues, but the main usage model remains centered on:

* input normalization
* backend emission
* emitted code inspection
* regression validation

---

## 🧪 Supported backends

### ⚡ asm.js

The **asm.js** backend is an actively maintained output target.

It is part of the main validation workflow and remains one of the primary focuses of current development.

### 🐘 PHP

The **PHP** backend is also under active development and is part of the current backend focus alongside **asm.js**.

### ☕ Java

A **Java** backend remains part of the broader direction of the project.

It is not currently a primary focus, but the ongoing refactoring work is intended to keep the backend architecture extensible enough to support it more cleanly over time.

---

## 🧱 Development status

Recent work has focused on:

* 🔧 active refactoring of the internal pipeline
* 🏗️ continued progress on backend emission
* 🧭 keeping traversal behavior reliable for:

  * custom pass execution
  * MVP-oriented input validation
  * code emission flows

The current development focus is on making the tool more consistent, easier to evolve, and less prone to codegen regressions.

---

## ✅ Validation

Changes should be validated with project-aware commands.

Core validation commands:

```bash
yarn closure-make
```

```bash
node wasmxlang.js --dev --input-file sample.wast --normalize-wasm binaryen:min,wasm2lang:codegen --emit-code
```

Validation matters because this project is optimized for **confidence in emitted output**, not just raw experimentation.

---

## 🗺️ Roadmap

Here's the general direction of the project:

* [x] Maintain `asm.js` backend support
* [x] Continue improving `PHP` backend support
* [x] Strengthen normalization and traversal reliability
* [x] Improve validation and regression confidence
* [ ] Make backend internals easier to extend
* [ ] Reduce friction when adding or reviving additional targets
* [ ] Improve contributor ergonomics and documentation
* [ ] Keep Java/backend expansion practical over time

---

## 💡 Example focus areas

Useful areas of ongoing work include:

* backend emission improvements
* traversal and schema consistency
* validation fixtures
* code generation stability
* documentation and usage clarity
* internal refactoring for future backend growth

---

## 🤝 Contributing

Bug reports, focused issues, and pull requests are very welcome.

Good contribution areas include:

* 🧩 backend emission improvements
* 🌲 traversal and schema consistency
* ✅ validation fixtures and regression coverage
* ⚙️ code generation stability
* 📖 documentation and usage clarity

Even small improvements help move the project forward.

---

## 💖 Sponsorship

If this tool is useful to you, GitHub sponsorship is one of the best ways to support continued development.

Sponsorship helps fund work on:

* 🔧 refactoring
* 🧪 validation coverage
* 🏗️ backend emission quality
* 🧭 tooling stability
* 📚 documentation
* 🚀 long-term backend expansion

Support is especially meaningful for users who rely on the continued improvement of the **asm.js** and **PHP** backends.

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)

### Why sponsor?

Because sponsorship makes it easier to spend time on the work that often matters most, but is hardest to fund:

* reducing regressions
* cleaning up internal architecture
* improving emitted output quality
* maintaining backend momentum
* making the project sustainable over time

> If `wasm2lang` saves you time, helps your experiments, or supports your tooling workflow, sponsoring the project is a practical way to help it grow.

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge)](https://github.com/sponsors/COFFEETALES)

---

## 📣 A note for users

If you use `wasm2lang` in your workflow, star the repo ⭐, open issues when something breaks 🐛, and consider sponsoring the project 💖

That combination helps a lot.

Every bit of support helps keep `wasm2lang` improving.
