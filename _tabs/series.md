---
layout: page
icon: fas fa-layer-group
order: 2
title: Series
---

{% assign groups = site.series | group_by: 'series' %}

{% for group in groups %}

## {{ group.name }}

{% assign parts = group.items | sort: 'part' %}
{% for part in parts %}
- {{ part.part }}부. [{{ part.title }}]({{ part.url | relative_url }})
  <span style="color:gray; font-size:0.85em;">{{ part.date | date: "%Y.%m.%d" }}</span>
{% endfor %}

---

{% endfor %}

{% if groups.size == 0 %}
*아직 시리즈가 없어요. `_posts/` 에 글이 쌓이면 시리즈로 묶을 수 있어요.*
{% endif %}
