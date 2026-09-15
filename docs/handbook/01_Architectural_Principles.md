# Constellation Architecture Handbook

**Version 1.0**

---

# Chapter 01 — Architectural Principles

## Purpose

This chapter defines the architectural principles that govern the design and evolution of Constellation.

Unlike implementation details, these principles are intended to remain stable over the lifetime of the platform. They provide the framework through which architectural decisions are evaluated, engineering tradeoffs are resolved, and future capabilities are designed.

Future chapters describe *what* Constellation is built from.

This chapter defines *how* those pieces should be conceived.

---

# Why This Chapter Exists

Software inevitably evolves.

Programming languages change.

Frameworks change.

AI models change.

Storage technologies change.

The philosophy of a platform should change far more slowly.

Constellation is intended to evolve over many years. During that time, countless implementation decisions will be made by human developers, AI coding agents, and future contributors who were not present during the platform's original design.

This chapter exists to provide those contributors with a common architectural compass.

Whenever implementation choices become uncertain, these principles should take precedence over convenience.

---

# Architectural Principle 01

## Knowledge Is the Product

Constellation does not exist to generate prompts.

It does not exist to produce conversations.

It does not exist to create isolated media assets.

Constellation exists to cultivate durable creative knowledge.

Every workflow should leave the project more knowledgeable than it was before.

If useful work is produced but no reusable knowledge is preserved, the workflow is incomplete.

---

# Architectural Principle 02

## Structure Before Generation

Generation should always consume structured information.

Artificial intelligence should never be asked to invent context that already exists.

Projects should provide:

* structured entities
* relationships
* context
* production constraints
* style information
* historical knowledge

Generation is an outcome of understanding.

It should never replace understanding.

---

# Architectural Principle 03

## The Project Owns the Truth

Knowledge belongs to the project.

No individual AI model is authoritative.

No prompt is authoritative.

No temporary conversation is authoritative.

The project's structured knowledge is the single source of truth.

Generated artifacts may propose new ideas.

Only deliberate approval incorporates those ideas into project knowledge.

---

# Architectural Principle 04

## Separate Thinking From Execution

Planning and execution are distinct responsibilities.

Interpretation precedes planning.

Planning precedes production.

Production precedes review.

Review precedes approval.

The Director exists to reason.

Workers exist to execute.

Maintaining this separation enables replaceable tooling, reproducible workflows, and transparent orchestration.

---

# Architectural Principle 05

## Workflows Are Explicit

Constellation favors visible workflows over hidden automation.

Every significant workflow should have clearly defined:

* inputs
* outputs
* intermediate artifacts
* responsibilities
* failure states

Hidden behavior is difficult to understand, difficult to debug, and difficult to improve.

Explicit workflows become reusable knowledge.

---

# Architectural Principle 06

## AI Workers Are Replaceable

Artificial intelligence providers will evolve continuously.

Constellation should never become dependent upon a specific model, provider, or generation service.

Workers are implementation details.

Architecture is not.

Every AI capability should communicate through stable contracts rather than provider-specific assumptions.

Replacing an AI worker should not require redesigning the platform.

---

# Architectural Principle 07

## Projects Outlive Sessions

Conversations are temporary.

Projects are persistent.

Every interaction should strengthen the project's long-term understanding rather than disappear into conversational history.

Constellation measures progress by the growth of structured project knowledge rather than the length of individual AI conversations.

---

# Architectural Principle 08

## Every Artifact Has Provenance

Every significant artifact should answer the question:

*"Where did this come from?"*

Generated assets should preserve:

* originating project
* workflow
* prompts
* source entities
* generation settings
* producing worker
* version history

Reproducibility is a feature, not an afterthought.

---

# Architectural Principle 09

## Automation Preserves Human Intent

Artificial intelligence exists to amplify creativity rather than replace it.

The creator remains responsible for intent.

Constellation exists to preserve that intent while automating the mechanical aspects of production.

Automation should reduce friction without diminishing authorship.

---

# Architectural Principle 10

## Build Frameworks, Not Features

Constellation favors reusable production frameworks over isolated features.

Features solve individual problems.

Frameworks enable entire categories of creative work.

The Builder Pipeline is the first production framework.

Future frameworks should extend the platform rather than duplicate existing capabilities.

---

# Architectural Principle 11

## Architecture Is Historical Knowledge

Architecture is more than implementation.

It is accumulated reasoning.

Every significant architectural decision should preserve not only *what* changed, but *why* the change was made.

Constellation therefore requires Architecture Decision Records (ADRs) for changes that materially affect the platform's long-term architecture.

The purpose of an ADR is to preserve understanding across years of development.

Future contributors should inherit architectural reasoning rather than rediscover it.

---

# Architecture Decision Records

An ADR should be created whenever a proposed change materially affects one or more of the following:

* Domain model
* Core workflows
* Knowledge graph structure
* Builder Pipeline stages
* Director responsibilities
* AI worker contracts
* Public APIs
* Storage architecture
* Authentication or authorization
* Architectural principles
* Ownership boundaries between components

An ADR should document:

* Problem Statement
* Context
* Alternatives Considered
* Decision
* Rationale
* Tradeoffs
* Consequences
* Future Reconsideration Conditions
* Relationship to Architectural Principles

Architecture evolves intentionally.

Every important decision deserves a permanent record.

---

# Architect's Notes

These principles intentionally favor long-term coherence over short-term convenience.

Individual implementations may change.

Technologies may be replaced.

Workflows may evolve.

The principles described in this chapter should remain stable unless the philosophy of Constellation itself changes.

Future chapters should implement these principles.

They should not redefine them.

