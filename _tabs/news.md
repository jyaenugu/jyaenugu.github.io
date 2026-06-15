---
layout: page
icon: fas fa-newspaper
order: 4
title: News
---

{% assign items = site.data.news | sort: 'date' | reverse %}

{% for item in items %}

**{{ item.date | date: "%Y.%m.%d" }}** — {{ item.text }}

![]({{ item.image | relative_url }})

---

{% endfor %}
