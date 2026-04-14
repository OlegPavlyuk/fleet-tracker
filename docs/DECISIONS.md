# Decisions Log

> Light ADR — записуємо тільки **нетривіальні** рішення з контекстом і альтернативами.
> Не дублюємо з `PROGRESS.md` (стан) і не дублюємо з коду (що, як).

## Format

```markdown
## YYYY-MM-DD — Short title

**Context**: чому виникло питання — що змусило обирати

**Decision**: що обрали (одне речення)

**Alternatives considered**:

- Альтернатива A — чому відкинули
- Альтернатива B — чому відкинули

**Trade-offs**: усвідомлені компроміси та коли можемо переглянути
```

---

## 2026-04-14 — Vertical slice for v1 (Variant B)

**Context**: Треба обрати, як охоплювати скоп v1 — мінімальний e2e, або зразу з усіма advanced-фічами вакансії (Protobuf, WASM, OAuth).

**Decision**: Variant B — thin e2e + Drizzle ORM з PostGIS + базовий history endpoint. JSON wire-format. JWT access-only. Без Protobuf/WASM/OAuth у v1.

**Alternatives considered**:

- Variant A (тонкий e2e з raw SQL) — швидше, але без Drizzle і spatial-БД, які є ключовими для вакансії
- Variant C (тонкий e2e + Protobuf зразу) — Protobuf-codegen на старті ускладнює setup, краще порівняти JSON↔Protobuf вже на робочому фундаменті в v2
- "Все одразу" (Protobuf + WASM + OAuth + Drizzle) — ризик потонути в setup, мало шансів довести до робочого demo

**Trade-offs**: Дві наступні итерації (v2, v3) додаватимуть Protobuf і WASM поверх існуючого коду — це **бажано**, бо буде видно різницю у власному коді (benchmarks, refactor patterns) — додаткова цінність для портфоліо.

---

## 2026-04-14 — Single backend process for v1 (no microservices)

**Context**: Архітектура pipeline (ingest → processing → distribution) природно ділиться на сервіси. Робити одразу як 3 процеси чи один?

**Decision**: Один Express-процес у v1 з модульним розділенням всередині (`ingest/`, `realtime/`, `state/`, `persist/`).

**Alternatives considered**:

- 3 окремі сервіси з message broker — реалістично для прод, але overkill для 50 дронів і додає дні setup без цінності навчання
- Worker threads — компроміс, але ускладнює debugging без реальної потреби

**Trade-offs**: При навантаженні 10k+ дронів (заплановано в v5) розділимо на сервіси через NATS JetStream — це буде окрема цінна вправа з реальною мотивацією.

---

## 2026-04-14 — `ws` library over `socket.io` for v1

**Context**: Вакансія згадує `socket.io` як плюс. Брати його зразу чи `ws`?

**Decision**: `ws` у v1, `socket.io` додати у v2 для прямого порівняння.

**Alternatives considered**:

- `socket.io` зразу — закритий API, важче розуміти WS-механіки під капотом, гірше для навчання
- Обидва паралельно — overkill у v1

**Trade-offs**: У v2 матимемо живе порівняння (latency, payload size, fallback handling) — це сильніший наратив для портфоліо, ніж "взяв socket.io бо так радять".

---

## 2026-04-14 — JWT in localStorage for v1 (not httpOnly cookie)

**Context**: Best-practice — httpOnly cookie + CSRF-захист. Це додає ~півдня setup (CORS credentials, refresh-token rotation, CSRF middleware).

**Decision**: localStorage у v1. Перенести на httpOnly cookie разом з OAuth-итерацією v4.

**Alternatives considered**:

- httpOnly cookie зразу — правильно, але роздуває auth-крок v1 непропорційно scope

**Trade-offs**: localStorage вразливий до XSS. У v1 web — внутрішній dashboard без user-generated content, ризик низький. **Не деплоїти v1 у production з реальними даними.**
