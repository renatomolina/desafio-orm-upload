import csvParse from 'csv-parse';
import fs from 'fs';
import { getRepository, getCustomRepository, In } from 'typeorm';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface TransactionCSV {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}

class ImportTransactionsService {
  async execute(path: string): Promise<TransactionCSV[]> {
    const stream = fs.createReadStream(path);

    const parser = csvParse({
      from_line: 2,
    });

    const parseCSV = stream.pipe(parser);

    const categories: string[] = [];
    const transactions: TransactionCSV[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) {
        return;
      }

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoryRespository = getRepository(Category);
    const existentCategories = await categoryRespository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoryRespository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoryRespository.save(newCategories);

    const allCategories = [...newCategories, ...existentCategories];

    const transactionRepository = getCustomRepository(TransactionsRepository);
    const createdTransactions = transactionRepository.create(
      transactions.map(newTransaction => ({
        title: newTransaction.title,
        type: newTransaction.type,
        value: newTransaction.value,
        category: allCategories.find(
          category => category.title === newTransaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(path);

    return transactions;
  }
}

export default ImportTransactionsService;
