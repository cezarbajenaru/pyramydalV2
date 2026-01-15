#!/bin/bash
# Build Lambda deployment packages

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building Lambda deployment packages..."

# Function to build a Lambda package
build_lambda() {
    local lambda_name=$1
    local lambda_dir="$PROJECT_ROOT/lambda/$lambda_name"
    
    echo ""
    echo "===================================="
    echo "Building: $lambda_name"
    echo "===================================="
    
    if [ ! -d "$lambda_dir" ]; then
        echo "❌ Directory not found: $lambda_dir"
        return 1
    fi
    
    cd "$lambda_dir"
    
    # Clean previous build
    rm -rf package package.zip
    
    # Create package directory
    mkdir -p package
    
    # Install dependencies
    if [ -f requirements.txt ]; then
        echo "📦 Installing dependencies..."
        pip3 install -r requirements.txt -t package/ --upgrade
    fi
    
    # Copy handler
    echo "📄 Copying handler.py..."
    cp handler.py package/
    
    # Create ZIP
    echo "🗜️  Creating package.zip..."
    cd package
    zip -r ../package.zip . -q
    cd ..
    
    # Show size
    local size=$(du -h package.zip | cut -f1)
    echo "✅ Package created: package.zip ($size)"
    
    # Clean up package directory (keep zip)
    rm -rf package
}

# Build all Lambda functions
build_lambda "import_reference"
build_lambda "recalc"

echo ""
echo "===================================="
echo "✅ All Lambda packages built successfully!"
echo "===================================="
echo ""
echo "Next steps:"
echo "  1. Deploy with Terraform: cd infra/terraform/environments/prod && terraform apply"
echo "  2. Or deploy via GitHub Actions: git push origin main"
echo ""

