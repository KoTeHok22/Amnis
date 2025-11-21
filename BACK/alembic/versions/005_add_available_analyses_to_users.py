"""Add available_analyses column to users table

Revision ID: 005_add_available_analyses_to_users
Revises: 004_add_dream_summary_to_chats
Create Date: 2025-11-16 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '005_add_available_analyses_to_users'
down_revision = '004_add_dream_summary_to_chats'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if the available_analyses column exists before adding it
    conn = op.get_bind()

    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='available_analyses'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('available_analyses', sa.Integer(), nullable=False, default=0))


def downgrade() -> None:
    # Remove the available_analyses column from users table
    op.drop_column('users', 'available_analyses')