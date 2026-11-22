---
layout: page
icon: fas fa-envelope-open-text
order: 9
title: Ask
---

<!-- Anonymous message board. Data lives in the Cloudflare Worker in
     /ask-worker (excluded from the Jekyll build). Admin mode: /ask/#admin -->
<div id="ask" class="ask" data-api="https://ask-worker.jyaenugu.workers.dev" markdown="0">

  <p class="ask-intro">
    Leave me an anonymous message: a question, a thought, anything.
    I don't see who sent it, and every message stays private: only you
    and I can read it.
  </p>
  <p class="ask-intro">
    When you hit <strong>Send</strong>, you'll get a code. Save it! It's the
    only way to read my answer.
  </p>
  <p class="ask-intro">Korean is welcome too. Write in whichever language feels comfortable.</p>

  <form class="ask-form" id="ask-form" novalidate>
    <label class="ask-label" for="ask-body">Your message</label>
    <textarea id="ask-body" name="body" rows="5" maxlength="2000" required
      placeholder="Ask me anything…"></textarea>
    <div class="ask-row ask-row-end">
      <span class="ask-count" id="ask-count">0 / 2000</span>
    </div>
    <!-- Honeypot for bots; hidden from people and screen readers -->
    <div class="ask-hp" aria-hidden="true">
      <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <button type="submit" class="ask-btn" id="ask-send">Send</button>
    <p class="ask-status" id="ask-status" role="status"></p>
  </form>

  <div class="ask-code-box" id="ask-code-box" hidden>
    <p>Sent. This is your code. <strong>Save it now.</strong> It's the only way to check my answer later, and I can't recover it for you.</p>
    <div class="ask-code-row">
      <code id="ask-code"></code>
      <button type="button" class="ask-btn ask-btn-quiet" id="ask-copy">Copy</button>
    </div>
  </div>

  <h2 id="ask-check-heading">Check my message</h2>
  <form class="ask-lookup" id="ask-lookup" novalidate>
    <label class="visually-hidden" for="ask-lookup-code">Your code</label>
    <input id="ask-lookup-code" type="text" placeholder="xxxx-xxxx-xxxx" autocomplete="off" spellcheck="false">
    <button type="submit" class="ask-btn ask-btn-quiet">Open</button>
  </form>
  <div id="ask-lookup-result"></div>

  <section class="ask-admin" id="ask-admin" hidden>
    <h2>Inbox</h2>
    <form class="ask-lookup" id="ask-admin-login" novalidate>
      <label class="visually-hidden" for="ask-admin-pw">Admin password</label>
      <input id="ask-admin-pw" type="password" placeholder="Admin password" autocomplete="current-password">
      <button type="submit" class="ask-btn ask-btn-quiet">Log in</button>
    </form>
    <p class="ask-status" id="ask-admin-status" role="status"></p>
    <div id="ask-inbox"></div>
  </section>
</div>

<script src="{{ '/assets/js/ask.js' | relative_url }}" defer></script>
