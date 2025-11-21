"""Add dream_summary to chats table
Revision ID: 004_add_dream_summary_to_chats
Revises: 003_add_subscription_data_field
Create Date: 2025-11-16 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
revision = '004_add_dream_summary_to_chats'
down_revision = '003_add_subscription_data_field'
branch_labels = None
depends_on = None
def upgrade() -> None:
    # Check if the dream_summary column exists before adding it
    conn = op.get_bind()

    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='chats' AND column_name='dream_summary'
    """))
    if not result.fetchone():
        op.add_column('chats', sa.Column('dream_summary', sa.Text(), nullable=True))
def downgrade() -> None:
    op.drop_column('chats', 'dream_summary')