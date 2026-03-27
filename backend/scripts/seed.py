"""Seed script - create initial admin user and sample data."""

import asyncio
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from passlib.hash import bcrypt
from app.services.database import init_db, get_session, _session_factory


async def seed():
    await init_db()

    async with _session_factory() as session:
        # Check if admin already exists
        result = await session.execute(
            text("SELECT id FROM users WHERE username = :u"),
            {"u": "admin"},
        )
        if result.scalar():
            print("Admin user already exists, skipping seed.")
            return

        # Create admin user
        pw_hash = bcrypt.hash("admin123")
        await session.execute(
            text(
                "INSERT INTO users (username, email, password_hash, role) "
                "VALUES (:u, :e, :p, :r)"
            ),
            {"u": "admin", "e": "admin@example.com", "p": pw_hash, "r": "admin"},
        )

        # Create demo user
        pw_hash2 = bcrypt.hash("demo123")
        await session.execute(
            text(
                "INSERT INTO users (username, email, password_hash, role) "
                "VALUES (:u, :e, :p, :r)"
            ),
            {"u": "demo", "e": "demo@example.com", "p": pw_hash2, "r": "user"},
        )

        # Create a sample KB collection
        await session.execute(
            text(
                "INSERT INTO kb_collections (name, description, owner_id) "
                "VALUES (:n, :d, 1)"
            ),
            {"n": "General Knowledge", "d": "Default knowledge base collection"},
        )

        await session.commit()
        print("Seed complete: admin/admin123, demo/demo123, 1 KB collection created.")


if __name__ == "__main__":
    asyncio.run(seed())
