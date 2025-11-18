import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Course } from './entities/course.entity';
import { Enrollment } from 'src/enrollments/entities/enrollment.entity';

@Injectable()
export class CoursesService {

  constructor (
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
  ) {}

  // Criar novo Curso
  async create(createCourseDto: CreateCourseDto) {
    const existingCourse = await this.courseRepository.findOneBy({
      name: createCourseDto.name,
    })

    if(existingCourse){
      throw new ConflictException('Este Curso ja foi criado.')
    }

    const course = this.courseRepository.create(createCourseDto);

    return await this.courseRepository.save(course);
  }

  // Buscar todas as Curso
  findAll() : Promise<Course[]> {

    return this.courseRepository.find();
  }

  // Buscar Curso por id
  async findOne(id: string): Promise<Course & { studentsCount?: number; disciplinesCount?: number; classesCount?: number }> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations: ['disciplines', 'disciplines.classes'],
    });

    if(!course){
      throw new NotFoundException(`Curso com o ID '${id}' nao encontrado.`)
    }

    const students = await this.findStudentsByCourseId(id);
    const studentsCount = students.length;
    const disciplinesCount = course.disciplines?.length ?? 0;
    const classesCount = course.disciplines?.reduce((acc, discipline) => {
      return acc + (discipline.classes?.length ?? 0);
    }, 0) ?? 0;

    return {
      ...course,
      studentsCount,
      disciplinesCount,
      classesCount,
    } as Course & {
      studentsCount: number;
      disciplinesCount: number;
      classesCount: number;
    };
  }

  async findStudentsByCourseId(courseId: string) {
    const course = await this.courseRepository.findOneBy({ id: courseId });

    if (!course) {
      throw new NotFoundException(`Curso com o ID '${courseId}' nao encontrado.`);
    }

    const enrollments = await this.enrollmentRepository.find({
      where: {
        class: {
          discipline: {
            course: { id: courseId },
          },
        },
      },
      relations: ['student', 'class', 'class.discipline', 'class.discipline.course'],
    });

    const studentsById = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        enrollment: string;
        status: string;
        classId?: string;
        classCode?: string;
      }
    >();

    for (const enrollment of enrollments) {
      const student = enrollment.student;
      if (!student) continue;

      const classId = enrollment.class?.id;
      const classCode = enrollment.class?.code;

      if (!studentsById.has(student.id)) {
        studentsById.set(student.id, {
          id: student.id,
          name: student.name,
          email: student.email,
          enrollment: enrollment.id,
          status: 'active',
          classId,
          classCode,
        });
        continue;
      }

      const existing = studentsById.get(student.id)!;
      if (!existing.classId && classId) {
        studentsById.set(student.id, { ...existing, classId, classCode });
      }
    }

    return Array.from(studentsById.values());
  }

  //Atualizar Curso
  async update(id: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    const course = await this.courseRepository.preload({ 
      id,
      ...updateCourseDto,
    });

    if(!course){
      throw new NotFoundException(`Curso com o ID '${id}' nao encontrado.`)
    }

    return await this.courseRepository.save(course);
  }

  // Excluir Course
  async remove(id: string): Promise<void> {
    const result = await this.courseRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Deparatamento com o ID '${id}' nao encontrado.`);
    }
  }
}
