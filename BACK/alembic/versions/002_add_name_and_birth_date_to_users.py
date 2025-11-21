"""Add name and birth_date fields to users table
Revision ID: 002_add_name_and_birth_date_to_users
Revises: 001_add_chat_model
Create Date: 2025-11-15 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
revision = '002_add_name_and_birth_date_to_users'
down_revision = '001_add_chat_model'
branch_labels = None
depends_on = None
def upgrade() -> None:
    # Check if each column exists before adding it
    conn = op.get_bind()

    # Check for name column
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='name'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('name', sa.String(), nullable=True))

    # Check for birth_date column
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='birth_date'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('birth_date', sa.DateTime(), nullable=True))
def downgrade() -> None:
    op.drop_column('users', 'birth_date')
    op.drop_column('users', 'name')