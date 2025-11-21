"""Initial migration to create users table

Revision ID: 000_initial_users_table
Revises: None
Create Date: 2025-11-16 06:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '000_initial_users_table'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Check if the users table already exists before creating it
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'users'
        );
    """))
    table_exists = result.fetchone()[0]

    if not table_exists:
        op.create_table(
            'users',
            # Remove index=True for primary key since it's redundant
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('phone_number', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=True),
            sa.Column('birth_date', sa.DateTime(), nullable=True),
            sa.Column('password_hash', sa.String(), nullable=False),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(), default=sa.func.current_timestamp()),
            sa.Column('updated_at', sa.DateTime(), default=sa.func.current_timestamp(), onupdate=sa.func.current_timestamp())
        )
        
        # Create indexes separately with existence checks
        conn = op.get_bind()
        
        # Check if id index exists
        id_index_exists = conn.execute(sa.text(
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ix_users_id')"
        )).scalar()
        
        if not id_index_exists:
            op.create_index(op.f('ix_users_id'), 'users', ['id'])
            
        # Check if phone number index exists
        phone_index_exists = conn.execute(sa.text(
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ix_users_phone_number')"
        )).scalar()
        
        if not phone_index_exists:
            op.create_index(op.f('ix_users_phone_number'), 'users', ['phone_number'], unique=True)
        
        # Add unique constraint separately
        unique_constraint_exists = conn.execute(sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name='users' AND constraint_name='uq_users_phone_number')"
        )).scalar()
        
        if not unique_constraint_exists:
            op.create_unique_constraint('uq_users_phone_number', 'users', ['phone_number'])


def downgrade() -> None:
    op.drop_index(op.f('ix_users_phone_number'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')