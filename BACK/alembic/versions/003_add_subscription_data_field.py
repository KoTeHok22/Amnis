"""Add subscription data field to users table
Revision ID: 003_add_subscription_data_field
Revises: 002_add_name_and_birth_date_to_users
Create Date: 2025-11-15 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
revision = '003_add_subscription_data_field'
down_revision = '002_add_name_and_birth_date_to_users'
branch_labels = None
depends_on = None
def upgrade() -> None:
    # Check if each column exists before adding it
    conn = op.get_bind()

    # Check for subscription_plan column
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='subscription_plan'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('subscription_plan', sa.String(), nullable=True))

    # Check for remaining_analyses column
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='remaining_analyses'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('remaining_analyses', sa.Integer(), nullable=True, default=0))

    # Check for subscription_expires_at column
    result = conn.execute(sa.text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='subscription_expires_at'
    """))
    if not result.fetchone():
        op.add_column('users', sa.Column('subscription_expires_at', sa.DateTime(), nullable=True))
def downgrade() -> None:
    op.drop_column('users', 'subscription_expires_at')
    op.drop_column('users', 'remaining_analyses')
    op.drop_column('users', 'subscription_plan')