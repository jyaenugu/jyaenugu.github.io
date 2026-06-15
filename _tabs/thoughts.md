---
layout: page
icon: fas fa-feather-pointed
order: 5
title: Thoughts
---

{% assign thoughts = site.thoughts | sort: 'date' | reverse %}

{% for t in thoughts %}
- <span style="color:gray; font-size:0.85em;">{{ t.date | date: "%Y.%m.%d" }}</span> &nbsp; [{{ t.title }}]({{ t.url | relative_url }})
{% endfor %}

{% if thoughts.size == 0 %}
*아직 생각이 없어요.*
{% endif %}
